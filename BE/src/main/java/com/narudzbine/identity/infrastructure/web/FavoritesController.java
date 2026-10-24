package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.buyerworkspace.api.SharedFavorites;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.trading.api.*;
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
@RequestMapping("/api/v1/favorites")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class FavoritesController {
 private final SharedFavorites favorites;private final VendorProducts products;private final TradingConnections trading;private final BuyerOfferProjection projection;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx;
 FavoritesController(SharedFavorites favorites,VendorProducts products,TradingConnections trading,BuyerOfferProjection projection,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager){this.favorites=favorites;this.products=products;this.trading=trading;this.projection=projection;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @GetMapping Page list(HttpServletRequest r){
  AuthController.noBody(r);for(var e:r.getParameterMap().entrySet()){if(!Set.of("page","size","includeTotal").contains(e.getKey())||e.getValue().length!=1){throw StockRequests.invalid(e.getKey());}}
  var q=ProductRequests.query(r);var s=policy.select(r);var initial=admit(s,false);
  for(int attempt=0;attempt<3;attempt++){
   // Routing discovery is never returned. Final page and total are reread under the buyer guard.
   var vendors=tx.execute(status->{scope(s,initial,Set.of(),false,null);return vendorIds(favorites.list(initial.organizationId(),q.page(),q.size(),false));});
   try{return tx.execute(status->{var buyer=scope(s,initial,vendors,false,null);var page=favorites.list(buyer.organizationId(),q.page(),q.size(),q.total());if(!vendors.containsAll(vendorIds(page))){throw new PageChanged();}Instant at=now();var result=new Page(page.items().stream().map(i->response(buyer,i,at)).toList(),q.page(),q.size(),page.total());activity(s);return result;});}catch(PageChanged changed){/* Definite rollback of read-only work; rediscover the bounded page. */}
  }
  throw new AuthHttpFailure(503,"SERVICE_UNAVAILABLE");
 }
 @PutMapping("/{productId}") Favorite add(@PathVariable String productId,HttpServletRequest r){
  AuthController.noBody(r);AuthController.noQuery(r);UUID product=ContactRequests.id(productId,"PATH","productId");var s=policy.select(r);String csrf=s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;var initial=admit(s,true);
  UUID vendor=tx.execute(status->products.vendorForProduct(product).orElseThrow(FavoritesController::missing));
  return tx.execute(status->{var buyer=scope(s,initial,Set.of(vendor),true,csrf);Instant at=now();var offer=offer(buyer,vendor,product,at);if(offer==null){throw missing();}var saved=favorites.add(buyer.organizationId(),vendor,product);activity(s);return new Favorite(product,true,offer,AccountResponses.time(saved.createdAt()));});
 }
 @DeleteMapping("/{productId}") @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
 void remove(@PathVariable String productId,HttpServletRequest r){
  AuthController.noBody(r);AuthController.noQuery(r);UUID product=ContactRequests.id(productId,"PATH","productId");var s=policy.select(r);String csrf=s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;var initial=admit(s,true);
  tx.executeWithoutResult(status->{var buyer=scope(s,initial,Set.of(),true,csrf);favorites.remove(buyer.organizationId(),product);activity(s);});
 }
 private BusinessScope admit(SessionTransportPolicy.Selected s,boolean write){var initial=tx.execute(status->{var principal=sessions.authenticate(s.secret(),s.transport());return buyer(principal.accountId(),null);});throttle.admitApi(initial.accountId(),write);return initial;}
 private BusinessScope scope(SessionTransportPolicy.Selected s,BusinessScope initial,Set<UUID> vendors,boolean write,String csrf){var principal=sessions.authenticateForWorkspace(s.secret(),s.transport(),initial.organizationId(),vendors);if(write&&s.transport()==SessionTransport.BROWSER){sessions.requireCsrf(s.secret(),csrf);}return buyer(principal.accountId(),initial.organizationId());}
 private BusinessScope buyer(UUID actor,UUID expected){var m=memberships.lockForAuthorization(actor).orElseThrow(FavoritesController::missing);if(m.type()!=OrganizationType.BUYER||(expected!=null&&!expected.equals(m.organizationId()))){throw missing();}return authorization.require(actor,m.organizationId(),m.country(),BusinessCapability.PREPARE_BUYER_ORDER);}
 private Favorite response(BusinessScope buyer,SharedFavorites.Item i,Instant at){var offer=offer(buyer,i.vendorId(),i.productId(),at);return new Favorite(i.productId(),offer!=null,offer,AccountResponses.time(i.createdAt()));}
 private BuyerOffersController.Offer offer(BusinessScope buyer,UUID vendor,UUID product,Instant at){
  var connection=trading.find(vendor,buyer.organizationId());if(connection.isEmpty()||!connection.get().state().equals("ACTIVE")||!connection.get().country().equals(buyer.country().name())){return null;}
  var partner=trading.findPartner(buyer.organizationId(),vendor);if(partner.isEmpty()||!partner.get().country().equals(buyer.country().name())){return null;}
  var p=products.read(vendor,product);return p.state().equals("ACTIVE")?projection.offer(buyer.organizationId(),vendor,p,p.values().minimumQuantity(),at):null;
 }
 private static Set<UUID> vendorIds(SharedFavorites.Page page){return page.items().stream().map(SharedFavorites.Item::vendorId).collect(java.util.stream.Collectors.toUnmodifiableSet());}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
 private void activity(SessionTransportPolicy.Selected s){sessions.recordSuccessfulActivity(s.secret(),s.transport());}
 private static ProductFailure missing(){return new ProductFailure(ProductFailure.Reason.NOT_FOUND,null,null);}
 private static final class PageChanged extends RuntimeException{}
 record Favorite(UUID productId,boolean available,BuyerOffersController.Offer offer,String createdAt){}
 record Page(List<Favorite> items,int page,int size,Long total){}
}
