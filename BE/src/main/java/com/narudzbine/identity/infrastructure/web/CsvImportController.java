package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.pricing.api.BasePricing;
import com.narudzbine.shared.api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/catalogue/import-previews")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class CsvImportController {
 private final byte[] creationKey;private final CsvImports imports;private final VendorProducts products;private final BasePricing pricing;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final ResourceRevisions revisions;private final UuidGenerator ids;private final Clock clock;private final PlatformTransactionManager manager;private final TransactionTemplate tx;
 CsvImportController(CsvImports imports,VendorProducts products,BasePricing pricing,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,UuidGenerator ids,Clock clock,PlatformTransactionManager manager,@org.springframework.beans.factory.annotation.Value("${identity.http.replay-fingerprint-key:${identity.http.revision-key}}")String fingerprintKey){this.creationKey=Base64.getDecoder().decode(fingerprintKey);this.imports=imports;this.products=products;this.pricing=pricing;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.revisions=revisions;this.ids=ids;this.clock=clock;this.manager=manager;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @PostMapping ResponseEntity<PreviewResult> preview(HttpServletRequest r)throws IOException{
  AuthController.noQuery(r);var selected=policy.select(r);String csrf=csrf(r,selected);admit(selected,true);var vendor=tx.execute(s->scope(selected,true,csrf));throttle.admitImport(vendor.organizationId());var parsed=CsvRequests.read(r,ids);UUID id=ids.next();var result=tx.execute(s->{var current=scope(selected,true,csrf);requirePrice(current,parsed.requiresPrice());var p=imports.store(current.accountId(),current.organizationId(),id,parsed.rowCount(),parsed.requiresPrice(),parsed.rows(),parsed.errors(),revisions.encode("import/v1",id,1));activity(selected);return p;});return ResponseEntity.created(java.net.URI.create("/api/v1/catalogue/import-previews/"+id)).body(preview(result));
 }
 @GetMapping("/{previewId}") PreviewResult get(@PathVariable String previewId,HttpServletRequest r){AuthController.noQuery(r);AuthController.noBody(r);UUID id=ContactRequests.id(previewId,"PATH","previewId");var selected=policy.select(r);admit(selected,false);return tx.execute(s->{var scope=scope(selected,false,null);var p=imports.read(scope.organizationId(),id);requirePrice(scope,p.requiresPrice());if(!clock.instant().isBefore(p.expiresAt())){throw new ImportFailure("PREVIEW_EXPIRED");}activity(selected);return preview(p);});}
 @PostMapping("/{previewId}/confirmation") Result confirm(@PathVariable String previewId,HttpServletRequest r)throws IOException{
  AuthController.noQuery(r);UUID id=ContactRequests.id(previewId,"PATH","previewId");String expected=ContactRequests.revisionCommand(r);var selected=policy.select(r);String csrf=csrf(r,selected);admit(selected,true);return retry(template->template.execute(s->{var scope=scope(selected,true,csrf);var p=imports.lock(scope.organizationId(),id);requirePrice(scope,p.requiresPrice());var replay=imports.replay(scope.organizationId(),id,expected);if(replay.isPresent()){activity(selected);return result(replay.get());}if(!java.security.MessageDigest.isEqual(expected.getBytes(java.nio.charset.StandardCharsets.UTF_8),p.originalRevision().getBytes(java.nio.charset.StandardCharsets.UTF_8))){throw new RevisionConflict(p.originalRevision());}if(!clock.instant().isBefore(p.expiresAt())){throw new ImportFailure("PREVIEW_EXPIRED");}if(!p.valid()){throw new ImportFailure("INVALID_STATE",p.errors());}var errors=imports.validate(scope.organizationId(),p.rows(),p.rowCount());if(!errors.isEmpty()){throw new ImportFailure("IMPORT_STALE",errors);}
   products.createMany(scope.accountId(),scope.organizationId(),p.rows().stream().map(row->new VendorProducts.NewProduct(row.id(),row.product(),ProductRequests.digest(row.product(),creationKey))).toList());
   var initialPrices=new LinkedHashMap<UUID,java.math.BigDecimal>();for(var row:p.rows())if(row.basePrice()!=null)initialPrices.put(row.id(),row.basePrice());pricing.initializeImportedBases(scope.accountId(),scope.organizationId(),initialPrices);
   products.activateMany(scope.accountId(),scope.organizationId(),p.rows().stream().filter(CsvImports.Row::activate).map(CsvImports.Row::id).toList());
   for(var row:p.rows())imports.recordProduct(scope.organizationId(),id,row);var completed=imports.complete(scope.accountId(),scope.organizationId(),p,expected);activity(selected);return result(completed);
  }));
 }
 private BusinessScope scope(SessionTransportPolicy.Selected selected,boolean write,String csrf){var principal=sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport());if(write&&selected.transport()==SessionTransport.BROWSER){sessions.requireCsrf(selected.secret(),csrf);}var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new ImportFailure("NOT_FOUND"));if(member.type()!=OrganizationType.VENDOR){throw new ImportFailure("NOT_FOUND");}return authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.EDIT_CATALOGUE);}
 private void requirePrice(BusinessScope scope,boolean needed){if(needed){authorization.require(scope.accountId(),scope.organizationId(),scope.country(),BusinessCapability.EDIT_PRICES);}}
 private void admit(SessionTransportPolicy.Selected selected,boolean write){UUID actor=tx.execute(s->sessions.replayAdmissionAccount(selected.secret(),selected.transport()));throttle.admitApi(actor,write);}
 private void activity(SessionTransportPolicy.Selected selected){sessions.recordSuccessfulActivity(selected.secret(),selected.transport());}
 private static String csrf(HttpServletRequest r,SessionTransportPolicy.Selected s){return s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;}
 private PreviewResult preview(CsvImports.Preview p){return new PreviewResult(p.id(),p.originalRevision(),AccountResponses.time(p.expiresAt()),p.rowCount(),p.valid(),p.errors(),p.rows().stream().map(row->new ProposedRow(row.row(),new ProductInput(row.id(),row.product().sku(),row.product().name(),row.product().description(),row.product().unitId(),row.product().packDescription(),row.product().categoryId(),row.product().tagIds(),row.product().minimumQuantity(),row.product().quantityStep()),row.basePrice()==null?null:row.basePrice().toPlainString(),row.activate())).toList());}
 private static Result result(CsvImports.Result r){return new Result(r.id(),r.productIds(),AccountResponses.time(r.completedAt()));}
 record ProductInput(UUID id,String sku,String name,String description,UUID unitId,String packDescription,UUID categoryId,List<UUID> tagIds,int minimumQuantity,int quantityStep){}
 record ProposedRow(int row,ProductInput product,String basePrice,boolean activate){@Override public String toString(){return "ProposedRow[redacted]";}}
 record PreviewResult(UUID id,String revision,String expiresAt,int rowCount,boolean valid,List<CsvImports.Error> errors,List<ProposedRow> rows){}
 record Result(UUID id,List<UUID> productIds,String completedAt){}
 private <T>T retry(Function<TransactionTemplate,T> work){long deadline=System.nanoTime()+30_000_000_000L;for(int attempt=0;;attempt++){var command=new TransactionTemplate(manager);command.setTimeout(Math.max(1,(int)Math.min(30,(deadline-System.nanoTime()+999999999)/1000000000)));try{return work.apply(command);}catch(RuntimeException failure){String state=null;for(Throwable cause=failure;cause!=null;cause=cause.getCause()){if(cause instanceof java.sql.SQLException sql){state=sql.getSQLState();break;}}if(attempt>=2||!Set.of("40001","40P01").contains(state==null?"":state)||System.nanoTime()>=deadline){throw failure;}try{Thread.sleep(java.util.concurrent.ThreadLocalRandom.current().nextLong(attempt==0?25:75,attempt==0?76:151));}catch(InterruptedException e){Thread.currentThread().interrupt();throw failure;}}}}
}
