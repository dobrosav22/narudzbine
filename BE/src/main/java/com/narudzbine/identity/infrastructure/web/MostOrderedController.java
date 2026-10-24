package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.ordering.api.MostOrderedSuggestions;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class MostOrderedController {
 private final MostOrderedSuggestions suggestions;private final VendorProducts products;private final TradingConnections trading;private final BuyerOfferProjection projection;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx;
 MostOrderedController(MostOrderedSuggestions suggestions,VendorProducts products,TradingConnections trading,BuyerOfferProjection projection,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager){this.suggestions=suggestions;this.products=products;this.trading=trading;this.projection=projection;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @GetMapping("/api/v1/suggestions/most-ordered") BuyerOffersController.Page list(HttpServletRequest r){
  AuthController.noBody(r);var q=query(r);var s=policy.select(r);var initial=tx.execute(status->buyer(sessions.authenticate(s.secret(),s.transport()).accountId(),null));throttle.admitApi(initial.accountId(),false);
  for(int attempt=0;attempt<3;attempt++){
   var vendors=tx.execute(status->{var current=scope(s,initial,Set.of());var ids=new HashSet<UUID>(vendorIds(suggestions.list(current.organizationId(),current.country(),q.vendor(),q.page(),q.size(),false)));if(q.vendor()!=null)ids.add(q.vendor());return Set.copyOf(ids);});
   try{return tx.execute(status->{var current=scope(s,initial,vendors);if(q.vendor()!=null)requireVendor(current,q.vendor());var page=suggestions.list(current.organizationId(),current.country(),q.vendor(),q.page(),q.size(),q.total());if(!vendors.containsAll(vendorIds(page)))throw new PageChanged();Instant at=clock.instant().truncatedTo(ChronoUnit.MILLIS);var result=new BuyerOffersController.Page(page.items().stream().map(i->{requireVendor(current,i.vendorId());var product=products.read(i.vendorId(),i.productId());if(!product.state().equals("ACTIVE"))throw new PageChanged();return projection.offer(current.organizationId(),i.vendorId(),product,product.values().minimumQuantity(),at);}).toList(),q.page(),q.size(),page.total());sessions.recordSuccessfulActivity(s.secret(),s.transport());return result;});}catch(PageChanged changed){/* Definite rollback before publication; rediscover current bounded page. */}
  }
  throw new AuthHttpFailure(503,"SERVICE_UNAVAILABLE");
 }
 private BusinessScope scope(SessionTransportPolicy.Selected s,BusinessScope initial,Set<UUID> vendors){var p=sessions.authenticateForWorkspace(s.secret(),s.transport(),initial.organizationId(),vendors);return buyer(p.accountId(),initial.organizationId());}
 private BusinessScope buyer(UUID actor,UUID expected){var m=memberships.lockForAuthorization(actor).orElseThrow(MostOrderedController::missing);if(m.type()!=OrganizationType.BUYER||expected!=null&&!expected.equals(m.organizationId()))throw missing();return authorization.require(actor,m.organizationId(),m.country(),BusinessCapability.PREPARE_BUYER_ORDER);}
 private void requireVendor(BusinessScope buyer,UUID vendor){var link=trading.find(vendor,buyer.organizationId()).orElseThrow(MostOrderedController::missing);if(!link.state().equals("ACTIVE")||!link.country().equals(buyer.country().name())||trading.findPartner(buyer.organizationId(),vendor).filter(p->p.country().equals(buyer.country().name())).isEmpty())throw missing();}
 private static Set<UUID> vendorIds(MostOrderedSuggestions.Page p){return p.items().stream().map(MostOrderedSuggestions.Item::vendorId).collect(java.util.stream.Collectors.toUnmodifiableSet());}
 private static Query query(HttpServletRequest r){for(var e:r.getParameterMap().entrySet())if(!Set.of("page","size","includeTotal","vendorId").contains(e.getKey())||e.getValue().length!=1)throw StockRequests.invalid(e.getKey());String total=r.getParameter("includeTotal"),vendor=r.getParameter("vendorId");if(total!=null&&!Set.of("true","false").contains(total))throw StockRequests.invalid("includeTotal");return new Query(number(r,"page",0,0,10000),number(r,"size",25,1,100),"true".equals(total),vendor==null?null:ContactRequests.id(vendor,"QUERY","vendorId"));}
 private static int number(HttpServletRequest r,String key,int fallback,int min,int max){String v=r.getParameter(key);if(v==null)return fallback;try{if(!v.matches("0|[1-9][0-9]{0,5}"))throw new IllegalArgumentException();int n=Integer.parseInt(v);if(n<min||n>max)throw new IllegalArgumentException();return n;}catch(IllegalArgumentException failure){throw StockRequests.invalid(key);}}
 private static ProductFailure missing(){return new ProductFailure(ProductFailure.Reason.NOT_FOUND,null,null);}
 private record Query(int page,int size,boolean total,UUID vendor){}
 private static final class PageChanged extends RuntimeException{}
}
