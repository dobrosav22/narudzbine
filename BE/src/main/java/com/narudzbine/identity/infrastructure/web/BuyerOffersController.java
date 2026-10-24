package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.pricing.api.*;
import com.narudzbine.inventory.api.BuyerStockAvailability;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Controller;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/vendors/{vendorId}")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class BuyerOffersController {
 private final BuyerOfferProjection projection;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final VendorProducts products;private final VendorTaxonomy taxonomy;private final TradingConnections trading;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx;private final OfferCursors cursors;
 BuyerOffersController(BuyerOfferProjection projection,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,VendorProducts products,VendorTaxonomy taxonomy,TradingConnections trading,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager,@Value("${identity.http.revision-key}")String key,@Value("${offers.cursor.previous-key:}")String previous,@Value("${offers.cursor.previous-until:}")String until){this.projection=projection;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.products=products;this.taxonomy=taxonomy;this.trading=trading;this.policy=policy;this.throttle=throttle;this.clock=clock;this.tx=new TransactionTemplate(manager);tx.setTimeout(10);cursors=new OfferCursors(Base64.getDecoder().decode(key),previous.isEmpty()?null:Base64.getDecoder().decode(previous),until.isEmpty()?null:Instant.parse(until),clock);}
 @GetMapping("/offers") Page list(@PathVariable String vendorId,HttpServletRequest r){AuthController.noBody(r);UUID vendor=ContactRequests.id(vendorId,"PATH","vendorId");var q=OfferRequests.list(r);var selected=policy.select(r);var initial=admit(selected);return tx.execute(status->{var scope=scope(selected,initial,vendor);Instant at=clock.instant().truncatedTo(ChronoUnit.MILLIS);var page=products.published(vendor,q.products(),q.featured());var result=new Page(projection.offers(scope.organizationId(),vendor,page.items(),at),q.products().page(),q.products().size(),page.total());activity(selected);return result;});}
 @GetMapping("/offers/{productId}") Offer detail(@PathVariable String vendorId,@PathVariable String productId,HttpServletRequest r){AuthController.noBody(r);UUID vendor=ContactRequests.id(vendorId,"PATH","vendorId"),product=ContactRequests.id(productId,"PATH","productId");Integer quantity=OfferRequests.quantity(r);var selected=policy.select(r);var initial=admit(selected);return tx.execute(status->{var scope=scope(selected,initial,vendor);var p=products.read(vendor,product);if(!p.state().equals("ACTIVE")){throw missing();}int q=quantity==null?p.values().minimumQuantity():quantity;if(q<p.values().minimumQuantity()||(q-p.values().minimumQuantity())%p.values().quantityStep()!=0){throw StockRequests.invalid("quantity");}var result=projection.offer(scope.organizationId(),vendor,p,q,clock.instant().truncatedTo(ChronoUnit.MILLIS));activity(selected);return result;});}
 @GetMapping("/offer-taxonomy") TaxonomyPage taxonomy(@PathVariable String vendorId,HttpServletRequest r){AuthController.noBody(r);UUID vendor=ContactRequests.id(vendorId,"PATH","vendorId");var q=OfferRequests.taxonomy(r);var selected=policy.select(r);var initial=admit(selected);return tx.execute(status->{var scope=scope(selected,initial,vendor);var relationship=trading.find(vendor,scope.organizationId()).orElseThrow(BuyerOffersController::missing);var position=q.cursor()==null?null:cursors.decode(q.cursor(),vendor,scope.organizationId(),relationship.id(),relationship.generation(),q.size());var page=taxonomy.offerNames(vendor,q.size(),position==null?null:position.id());String next=page.more()?cursors.encode(vendor,scope.organizationId(),relationship.id(),relationship.generation(),q.size(),new OfferCursors.Position(page.items().getLast().id(),position==null?clock.instant().plusSeconds(86400):position.expires())):null;activity(selected);return new TaxonomyPage(page.items().stream().map(n->new TaxonomyItem(n.id(),n.name(),n.kind().name())).toList(),next);});}
 private SessionService.BuyerAdmission admit(SessionTransportPolicy.Selected s){var initial=tx.execute(status->{try{return sessions.replayAdmissionBuyer(s.secret(),s.transport());}catch(BusinessAccessDenied denied){throw missing();}});throttle.admitApi(initial.actor(),false);return initial;}
 private BusinessScope scope(SessionTransportPolicy.Selected s,SessionService.BuyerAdmission initial,UUID vendor){var principal=sessions.authenticateForTradingRead(s.secret(),s.transport(),vendor,initial.buyer());var m=memberships.lockForAuthorization(principal.accountId()).orElseThrow(BuyerOffersController::missing);if(m.type()!=OrganizationType.BUYER||!m.organizationId().equals(initial.buyer())){throw missing();}var scope=authorization.require(principal.accountId(),m.organizationId(),m.country(),BusinessCapability.PREPARE_BUYER_ORDER);var relationship=trading.find(vendor,scope.organizationId()).orElseThrow(BuyerOffersController::missing);if(!relationship.state().equals("ACTIVE")||!relationship.country().equals(scope.country().name())){throw missing();}var partner=trading.partner(scope.organizationId(),vendor);if(!partner.country().equals(scope.country().name())){throw missing();}return scope;}
 private void activity(SessionTransportPolicy.Selected s){sessions.recordSuccessfulActivity(s.secret(),s.transport());}
 private static ProductFailure missing(){return new ProductFailure(ProductFailure.Reason.NOT_FOUND,null,null);}
 record Named(UUID id,String name){}
 record TaxonomyItem(UUID id,String name,String kind){}
 record TaxonomyPage(List<TaxonomyItem> items,String nextCursor){}
 record Tier(int minimumQuantity,String unitPrice){}
 record Promotion(UUID id,String name,String kind,String value,String startsAt,String endsAt,String createdAt){}
 record Snapshot(UUID id,String name,String kind,String value){}
 record Resolution(String baseUnitPrice,String normalUnitPrice,String agreedUnitPrice,UUID promotionId,String finalUnitPrice,String lineTotal,Snapshot appliedPromotion,Integer reachedTierThreshold,UUID agreedPriceId){}
 record Offer(ProductController.Result product,UUID vendorId,String unitName,String currency,String priceBasis,String basePrice,String agreedPrice,List<Tier> tiers,boolean stockTracked,Integer availableQuantity,Named category,List<Named> tags,List<Promotion> promotions,int pricedQuantity,Resolution effectivePrice,String pricedAt){}
 record Page(List<Offer> items,int page,int size,Long total){}
}
