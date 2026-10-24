package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.buyerworkspace.api.*;
import com.narudzbine.buyerworkspace.api.SharedDrafts.*;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/drafts")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class DraftsController {
 private final SharedDrafts drafts;private final VendorProducts products;private final Locations locations;private final TradingConnections trading;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final ResourceRevisions revisions;private final TransactionTemplate tx;private final byte[] key;
 DraftsController(SharedDrafts drafts,VendorProducts products,Locations locations,TradingConnections trading,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,PlatformTransactionManager manager,@Value("${identity.http.revision-key}")String key){this.drafts=drafts;this.products=products;this.locations=locations;this.trading=trading;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.revisions=revisions;this.key=Base64.getDecoder().decode(key);tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @GetMapping Page list(HttpServletRequest r){AuthController.noBody(r);for(var e:r.getParameterMap().entrySet()){if(!Set.of("page","size","includeTotal").contains(e.getKey())||e.getValue().length!=1){throw StockRequests.invalid(e.getKey());}}var q=ProductRequests.query(r);var s=policy.select(r);var initial=admit(s,false);return tx.execute(status->{var buyer=scope(s,initial,Set.of(),false,null);var page=drafts.list(buyer.organizationId(),q.page(),q.size(),q.total());activity(s);return new Page(page.items().stream().map(this::result).toList(),q.page(),q.size(),page.total());});}
 @GetMapping("/{draftId}") Result get(@PathVariable String draftId,HttpServletRequest r){AuthController.noBody(r);AuthController.noQuery(r);UUID id=ContactRequests.id(draftId,"PATH","draftId");var s=policy.select(r);var initial=admit(s,false);return tx.execute(status->{var buyer=scope(s,initial,Set.of(),false,null);var item=drafts.read(buyer.organizationId(),id);activity(s);return result(item);});}
 @PostMapping ResponseEntity<Result> create(HttpServletRequest r)throws IOException{AuthController.noQuery(r);var input=DraftRequests.input(r,true);var s=policy.select(r);String csrf=csrf(r,s);var initial=admit(s,true);byte[] digest=DraftRequests.digest(input.intent(),key);return tx.execute(status->{var buyer=scope(s,initial,Set.of(input.intent().vendorId()),true,csrf);var replay=drafts.replay(buyer.accountId(),buyer.organizationId(),input.id(),digest);Item item;if(replay.isPresent()){item=replay.get();}else{validate(buyer,input.intent(),null);item=drafts.create(buyer.accountId(),buyer.organizationId(),input.id(),input.intent(),digest);}activity(s);return ResponseEntity.status(201).header("Location","/api/v1/drafts/"+input.id()).body(result(item));});}
 @PutMapping("/{draftId}") Result update(@PathVariable String draftId,HttpServletRequest r)throws IOException{AuthController.noQuery(r);UUID id=ContactRequests.id(draftId,"PATH","draftId");var input=DraftRequests.input(r,false);var s=policy.select(r);String csrf=csrf(r,s);var initial=admit(s,true);UUID vendor=tx.execute(status->drafts.vendor(initial.organizationId(),id).orElseThrow(DraftsController::missing));return tx.execute(status->{var buyer=scope(s,initial,Set.of(vendor),true,csrf);var current=drafts.read(buyer.organizationId(),id);revision(current,input.expected());if(!current.state().equals("OPEN")){throw new DraftFailure(DraftFailure.Reason.INVALID_STATE,null);}if(!vendor.equals(input.intent().vendorId())){throw DraftRequests.invalid("/intent/vendorId");}validate(buyer,input.intent(),current.intent());var item=drafts.replace(buyer.accountId(),buyer.organizationId(),id,input.intent());activity(s);return result(item);});}
 @DeleteMapping("/{draftId}") @ResponseStatus(HttpStatus.NO_CONTENT)
 void discard(@PathVariable String draftId,HttpServletRequest r){AuthController.noBody(r);UUID id=ContactRequests.id(draftId,"PATH","draftId");for(var e:r.getParameterMap().entrySet()){if(!e.getKey().equals("expectedRevision")||e.getValue().length!=1){throw StockRequests.invalid(e.getKey());}}String expected=r.getParameter("expectedRevision");if(expected==null||expected.isEmpty()||expected.length()>256){throw StockRequests.invalid("expectedRevision");}var s=policy.select(r);String csrf=csrf(r,s);var initial=admit(s,true);tx.executeWithoutResult(status->{var buyer=scope(s,initial,Set.of(),true,csrf);var current=drafts.read(buyer.organizationId(),id);boolean repeat=current.state().equals("DISCARDED")&&revisions.matches("draft/v1",id,current.discardedFromRevision(),expected);if(!repeat){revision(current,expected);}drafts.discard(buyer.accountId(),buyer.organizationId(),id);activity(s);});}
 private void validate(BusinessScope buyer,Intent intent,Intent previous){
  UUID vendor=intent.vendorId();var connection=trading.find(vendor,buyer.organizationId()).orElseThrow(DraftsController::missing);if(!connection.country().equals(buyer.country().name())){throw missing();}
  boolean live=connection.state().equals("ACTIVE")&&trading.findPartner(buyer.organizationId(),vendor).filter(p->p.country().equals(buyer.country().name())).isPresent();
  var retained=new HashMap<UUID,Integer>();if(previous!=null){previous.lines().forEach(line->retained.put(line.productId(),line.quantity()));}
  for(int i=0;i<intent.lines().size();i++){var line=intent.lines().get(i);Integer old=retained.get(line.productId());if(!live&&(old==null||line.quantity()>old)){throw DraftRequests.invalid("/intent/lines/"+i);}if(old==null){var product=products.read(vendor,line.productId());if(!product.state().equals("ACTIVE")){throw DraftRequests.invalid("/intent/lines/"+i+"/productId");}}}
  UUID location=intent.deliveryLocationId();if(location!=null&&(previous==null||!location.equals(previous.deliveryLocationId()))){if(!locations.read(buyer.organizationId(),location).state().equals("ACTIVE")){throw DraftRequests.invalid("/intent/deliveryLocationId");}}
 }
 private BusinessScope admit(SessionTransportPolicy.Selected s,boolean write){var initial=tx.execute(status->{var p=sessions.authenticate(s.secret(),s.transport());return buyer(p.accountId(),null);});throttle.admitApi(initial.accountId(),write);return initial;}
 private BusinessScope scope(SessionTransportPolicy.Selected s,BusinessScope initial,Set<UUID> vendors,boolean write,String csrf){var p=sessions.authenticateForWorkspace(s.secret(),s.transport(),initial.organizationId(),vendors);if(write&&s.transport()==SessionTransport.BROWSER){sessions.requireCsrf(s.secret(),csrf);}return buyer(p.accountId(),initial.organizationId());}
 private BusinessScope buyer(UUID actor,UUID expected){var m=memberships.lockForAuthorization(actor).orElseThrow(DraftsController::missing);if(m.type()!=OrganizationType.BUYER||expected!=null&&!expected.equals(m.organizationId())){throw missing();}return authorization.require(actor,m.organizationId(),m.country(),BusinessCapability.PREPARE_BUYER_ORDER);}
 private void revision(Item item,String expected){if(!revisions.matches("draft/v1",item.id(),item.revision(),expected)){throw new RevisionConflict(revisions.encode("draft/v1",item.id(),item.revision()));}}
 private Result result(Item item){return new Result(item.id(),revisions.encode("draft/v1",item.id(),item.revision()),item.intent(),item.state(),item.submittedOrderId(),AccountResponses.time(item.createdAt()),AccountResponses.time(item.updatedAt()));}
 private String csrf(HttpServletRequest r,SessionTransportPolicy.Selected s){return s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;}
 private void activity(SessionTransportPolicy.Selected s){sessions.recordSuccessfulActivity(s.secret(),s.transport());}
 private static DraftFailure missing(){return new DraftFailure(DraftFailure.Reason.NOT_FOUND,null);}
 record Result(UUID id,String revision,Intent intent,String state,UUID submittedOrderId,String createdAt,String updatedAt){}
 record Page(List<Result> items,int page,int size,Long total){}
}
