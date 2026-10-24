package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.audit.api.SupportAudit;
import com.narudzbine.catalogue.api.VendorProducts;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.inventory.api.VendorInventory;
import com.narudzbine.ordering.api.Orders;
import com.narudzbine.pricing.api.*;
import com.narudzbine.reporting.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.Semaphore;
import java.util.function.Function;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class SupportController {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final SupportAccessService access;private final SupportAudit audit;private final SessionService sessions;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final ResourceRevisions revisions;private final SupportCursors cursors;
 private final VendorProducts products;private final BasePricing pricing;private final VendorInventory stock;private final VendorPromotions promotions;private final AgreedPrices agreed;private final Orders orders;private final BusinessReports reports;
 private final TransactionTemplate tx,snapshot;private final Semaphore reportAdmission=new Semaphore(1);
 SupportController(SupportAccessService access,SupportAudit audit,SessionService sessions,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,ResourceRevisions revisions,SupportCursors cursors,VendorProducts products,BasePricing pricing,VendorInventory stock,VendorPromotions promotions,AgreedPrices agreed,Orders orders,BusinessReports reports,PlatformTransactionManager manager){this.access=access;this.audit=audit;this.sessions=sessions;this.policy=policy;this.throttle=throttle;this.clock=clock;this.revisions=revisions;this.cursors=cursors;this.products=products;this.pricing=pricing;this.stock=stock;this.promotions=promotions;this.agreed=agreed;this.orders=orders;this.reports=reports;tx=new TransactionTemplate(manager);tx.setTimeout(30);snapshot=new TransactionTemplate(manager);snapshot.setReadOnly(true);snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);snapshot.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);snapshot.setTimeout(25);}
 @PostMapping("/api/v1/admin/support-access") ResponseEntity<ContextResult> create(HttpServletRequest r)throws IOException{
  AuthController.noQuery(r);var body=AuthRequests.object(r,Set.of("organizationId","reason","caseReference"));UUID target=ContactRequests.id(body.path("organizationId").isString()?body.path("organizationId").asString():null,"BODY","/organizationId");var errors=new ArrayList<AuthErrors.FieldError>();String reason=OrganizationRequests.text(body,"reason","",1000,false,errors),reference=OrganizationRequests.text(body,"caseReference","",100,false,errors);if(!errors.isEmpty())throw new AuthHttpFailure(errors);
  var selected=policy.select(r);String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;admit(selected,true);
  return tx.execute(status->{var scope=access.lock(target,Set.of()).orElseThrow(SupportController::missing);var principal=sessions.authenticateForProfileWrite(selected.secret(),selected.transport());requirePlatform(principal.platformAdministrator());if(selected.transport()==SessionTransport.BROWSER)sessions.requireCsrf(selected.secret(),csrf);var context=access.create(principal.accountId(),scope,reason,reference);sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return ResponseEntity.status(201).body(new ContextResult(context.id(),target,AccountResponses.time(context.expires())));});
 }
 @GetMapping("/api/v1/admin/support/organizations/{organizationId}/reports") BusinessReports.Summary report(@PathVariable String organizationId,HttpServletRequest r){
  UUID org=path(organizationId,"organizationId");var q=ReportRequests.parse(r,true);
  if(!reportAdmission.tryAcquire())throw new AuthHttpFailure(503,"SERVICE_UNAVAILABLE");
  try{return read(r,org,null,false,"REPORT",org,Map.of("from",q.from().toString(),"to",q.to().toString(),"grouping",q.grouping()),c->snapshot.execute(s->{var scope=new BusinessReports.Scope(c.target().id(),c.target().country(),c.target().vendor());return reports.summary(scope,q.range(scope.country(),now()),q.grouping());}));}catch(ReportOverflow f){throw new AuthHttpFailure(422,"REPORT_OVERFLOW");}finally{reportAdmission.release();}
 }
 @GetMapping("/api/v1/admin/support/organizations/{organizationId}/products") Page<ProductController.Result> products(@PathVariable String organizationId,HttpServletRequest r){UUID org=path(organizationId,"organizationId");var q=page(r);return read(r,org,null,true,"PRODUCTS",org,q.filters(),c->{var result=products.list(org,new VendorProducts.Query(q.page(),q.size(),q.total(),"",true,null,null,null));return new Page<>(result.items().stream().map(i->ProductResponses.result(i,revisions)).toList(),q.page(),q.size(),result.total());});}
 @GetMapping("/api/v1/admin/support/organizations/{organizationId}/promotions") Page<PromotionController.Result> promotions(@PathVariable String organizationId,HttpServletRequest r){UUID org=path(organizationId,"organizationId");var q=page(r);return read(r,org,null,true,"PROMOTIONS",org,q.filters(),c->{var result=promotions.list(org,q.page(),q.size(),q.total(),null);return new Page<>(result.items().stream().map(this::promotion).toList(),q.page(),q.size(),result.total());});}
 @GetMapping("/api/v1/admin/support/organizations/{organizationId}/agreed-prices") Page<AgreedPriceController.Result> agreed(@PathVariable String organizationId,HttpServletRequest r){UUID org=path(organizationId,"organizationId");var q=page(r);return read(r,org,null,true,"AGREED_PRICES",org,q.filters(),c->{var result=agreed.listVendor(org,q.page(),q.size(),q.total());return new Page<>(result.items().stream().map(i->new AgreedPriceController.Result(i.id(),revisions.encode("agreedprice/v1",i.id(),i.revision()),i.productId(),i.buyerOrganizationId(),i.unitPrice().toPlainString(),i.confirmationRequired())).toList(),q.page(),q.size(),result.total());});}
 @GetMapping("/api/v1/admin/support/products/{productId}/pricing") PricingController.Result pricing(@PathVariable String productId,HttpServletRequest r){AuthController.noQuery(r);UUID product=path(productId,"productId");return read(r,null,null,true,"PRICING",product,Map.of(),c->{var i=pricing.read(c.target().id(),product);return new PricingController.Result(product,revisions.encode("pricing/v1",product,i.revision()),product,i.values().basePrice()==null?null:i.values().basePrice().toPlainString(),i.values().tiers().stream().map(t->new PricingController.Tier(t.minimumQuantity(),t.unitPrice().toPlainString())).toList(),i.currency());});}
 @GetMapping("/api/v1/admin/support/products/{productId}/stock") InventoryController.Result stock(@PathVariable String productId,HttpServletRequest r){AuthController.noQuery(r);UUID product=path(productId,"productId");return read(r,null,null,true,"STOCK",product,Map.of(),c->{var i=stock.get(c.target().id(),product);return new InventoryController.Result(product,revisions.encode("stock/v1",product,i.revision())+"."+revisions.encode("stockepoch/v1",i.vendor(),i.epoch()),product,i.availableCount(),i.trackingEnabled(),i.confirmationRequired(),i.creditQuantity(),i.maximumSettableCount());});}
 @GetMapping("/api/v1/admin/support/orders/{orderId}") OrdersController.Result order(@PathVariable String orderId,HttpServletRequest r){AuthController.noQuery(r);UUID order=path(orderId,"orderId");return read(r,null,order,false,"ORDER",order,Map.of(),c->OrderResponses.response(orders,revisions,orders.read(c.target().id(),order),c.target().id(),false));}
 @GetMapping("/api/v1/admin/support/orders/{orderId}/messages") Messages messages(@PathVariable String orderId,HttpServletRequest r){UUID order=path(orderId,"orderId");var q=OrderHistoryRequests.query(r,true);return read(r,null,order,false,"MESSAGES",order,Map.of("size",q.size()),c->{
  var scope=new SupportCursors.Scope(c.actor(),c.id(),c.target().id(),c.target().country(),order,q.size());var after=q.cursor()==null?null:cursors.decode(q.cursor(),scope);var rows=orders.messages(c.target().id(),order,q.size(),after==null?null:after.at(),after==null?null:after.id());String next=null;if(rows.more()){var last=rows.items().getLast();next=cursors.encode(scope,new SupportCursors.Position(last.createdAt(),last.id(),c.expires()));}
  var items=rows.items().stream().map(m->{boolean own=m.authorOrganizationId().equals(c.target().id());return new Message(m.id(),m.orderId(),m.authorOrganizationId(),own?m.authorAccountId():null,own?m.authorDisplayName():null,m.text(),AccountResponses.time(m.createdAt()));}).toList();return new Messages(items,next);
 });}
 private <T>T read(HttpServletRequest r,UUID requiredOrg,UUID order,boolean vendor,String type,UUID resource,Map<String,?> filters,Function<SupportAccessService.Context,T> projection){
  AuthController.noBody(r);UUID context=header(r);var selected=policy.select(r);admit(selected,false);
  return tx.execute(status->{UUID target=access.route(context).orElseThrow(SupportController::missing);if(requiredOrg!=null&&!requiredOrg.equals(target))throw missing();Set<UUID> parties=order==null?Set.of():Set.of(orders.cancellationPartner(target,order).orElseThrow(SupportController::missing));var scope=access.lock(target,parties).orElseThrow(SupportController::missing);var principal=sessions.authenticateForProfileWrite(selected.secret(),selected.transport());requirePlatform(principal.platformAdministrator());var verified=access.require(principal.accountId(),context,scope).orElseThrow(SupportController::missing);if(vendor&&!scope.vendor())throw missing();if(order!=null){var retained=orders.read(target,order);if(!retained.vendor().country().name().equals(scope.country())||!retained.buyer().country().name().equals(scope.country()))throw missing();}T result=projection.apply(verified);if(!access.unexpired(verified))throw missing();audit.read(principal.accountId(),context,target,scope.country(),type,resource,JSON.writeValueAsString(filters));sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return result;});
 }
 private void admit(SessionTransportPolicy.Selected s,boolean write){UUID actor=tx.execute(status->{UUID id=sessions.replayAdmissionAccount(s.secret(),s.transport());requirePlatform(access.platformAccount(id));return id;});throttle.admitApi(actor,write);}
 private static void requirePlatform(boolean platform){if(!platform)throw missing();}
 private static AuthHttpFailure missing(){return new AuthHttpFailure(404,"NOT_FOUND");}
 private static UUID path(String value,String field){return ContactRequests.id(value,"PATH",field);}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
 private static UUID header(HttpServletRequest r){var values=Collections.list(r.getHeaders("X-Support-Access-Id"));if(values.size()!=1)throw new AuthHttpFailure(List.of(new AuthErrors.FieldError("HEADER","X-Support-Access-Id","INVALID_VALUE")));return ContactRequests.id(values.getFirst(),"HEADER","X-Support-Access-Id");}
 private static Paging page(HttpServletRequest r){for(var e:r.getParameterMap().entrySet())if(!Set.of("page","size","includeTotal").contains(e.getKey())||e.getValue().length!=1)throw StockRequests.invalid(e.getKey());int page=number(r,"page",0,0,10000),size=number(r,"size",25,1,100);String total=r.getParameter("includeTotal");if(total!=null&&!Set.of("true","false").contains(total))throw StockRequests.invalid("includeTotal");return new Paging(page,size,"true".equals(total));}
 private static int number(HttpServletRequest r,String field,int fallback,int min,int max){String v=r.getParameter(field);if(v==null)return fallback;try{if(!v.matches("0|[1-9][0-9]{0,5}"))throw new IllegalArgumentException();int n=Integer.parseInt(v);if(n<min||n>max)throw new IllegalArgumentException();return n;}catch(IllegalArgumentException e){throw StockRequests.invalid(field);}}
 private PromotionController.Result promotion(VendorPromotions.Item i){var v=i.values();return new PromotionController.Result(i.id(),revisions.encode("promotion/v1",i.id(),i.revision()),v.name(),v.kind().name(),v.value().toPlainString(),new PromotionController.Targets(v.productMode().name(),v.buyerMode().name(),v.productIds(),v.categoryIds(),v.buyerIds()),i.labels(),AccountResponses.time(v.startsAt()),AccountResponses.time(v.endsAt()),i.state(),AccountResponses.time(i.createdAt()),AccountResponses.time(i.updatedAt()),i.archived());}
 private record Paging(int page,int size,boolean total){Map<String,?> filters(){return Map.of("page",page,"size",size,"includeTotal",total);}}
 record ContextResult(UUID id,UUID organizationId,String expiresAt){}
 record Page<T>(List<T> items,int page,int size,Long total){}
 record Message(UUID id,UUID orderId,UUID authorOrganizationId,UUID ownAuthorAccountId,String ownAuthorDisplayName,String text,String createdAt){}
 record Messages(List<Message> items,String nextCursor){}
}
