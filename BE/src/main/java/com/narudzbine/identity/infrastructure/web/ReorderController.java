package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.ordering.api.*;
import com.narudzbine.catalogue.api.VendorProducts;
import com.narudzbine.inventory.api.ReviewStock;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
@RestController
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class ReorderController {
 private final Orders orders;private final VendorProducts products;private final TradingConnections trading;private final ReviewStock stock;private final BuyerOfferProjection projection;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx;
 ReorderController(Orders orders,VendorProducts products,TradingConnections trading,ReviewStock stock,BuyerOfferProjection projection,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager){this.orders=orders;this.products=products;this.trading=trading;this.stock=stock;this.projection=projection;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @GetMapping("/api/v1/orders/{orderId}/reorder-preview") Result preview(@PathVariable String orderId,HttpServletRequest r){
  AuthController.noQuery(r);AuthController.noBody(r);UUID order=ContactRequests.id(orderId,"PATH","orderId");var selected=policy.select(r);
  var admission=tx.execute(status->sessions.replayAdmissionBuyer(selected.secret(),selected.transport()));throttle.admitApi(admission.actor(),false);
  UUID vendor=tx.execute(status->orders.buyerVendor(admission.buyer(),order).orElseThrow(ReorderController::missing));
  return tx.execute(status->{
   var principal=sessions.authenticateForWorkspace(selected.secret(),selected.transport(),admission.buyer(),Set.of(vendor));var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(ReorderController::missing);
   if(member.type()!=OrganizationType.BUYER||!member.organizationId().equals(admission.buyer())){throw missing();}
   var buyer=authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.PREPARE_BUYER_ORDER);
   var source=orders.read(buyer.organizationId(),order);if(!source.buyer().organizationId().equals(buyer.organizationId())){throw missing();}
   boolean live=trading.find(vendor,buyer.organizationId()).filter(t->t.state().equals("ACTIVE")&&t.country().equals(buyer.country().name())).isPresent()&&trading.findPartner(buyer.organizationId(),vendor).filter(p->p.country().equals(buyer.country().name())).isPresent();
   Instant at=clock.instant().truncatedTo(ChronoUnit.MILLIS);var originals=OrderReviewsController.result(source.terms()).lines();var lines=new ArrayList<Line>();
   for(int i=0;i<source.terms().lines().size();i++){
    var original=source.terms().lines().get(i);var frozen=originals.get(i);var product=live?products.find(vendor,original.productId()).filter(p->p.state().equals("ACTIVE")).orElse(null):null;
    if(product==null){lines.add(new Line(frozen,false,List.of("UNAVAILABLE"),null));continue;}
    int quantity=ReorderComparison.pricedQuantity(original,product.values());var offer=projection.offer(buyer.organizationId(),vendor,product,quantity,at);
    var compared=ReorderComparison.compare(original,product.values(),offer.unitName(),new BigDecimal(offer.effectivePrice().finalUnitPrice()),stock.eligibility(vendor,product.id(),original.quantity())==ReviewStock.Status.READY);
    lines.add(new Line(frozen,compared.available(),compared.changes(),offer));
   }
   sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return new Result(order,lines);
  });
 }
 private static OrderFailure missing(){return new OrderFailure(OrderFailure.Reason.NOT_FOUND);}
 record Line(OrderReviewsController.Line original,boolean available,List<String> changes,BuyerOffersController.Offer currentOffer){public Line{changes=List.copyOf(changes);}}
 record Result(UUID originalOrderId,List<Line> lines){public Result{lines=List.copyOf(lines);}}
}
