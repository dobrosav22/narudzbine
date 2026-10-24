package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.ordering.api.*;
import com.narudzbine.buyerworkspace.api.SharedDrafts;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/order-reviews")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class OrderReviewsController {
 private final OrderReviews reviews;private final SharedDrafts drafts;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final ResourceRevisions revisions;private final Clock clock;private final TransactionTemplate tx;
 OrderReviewsController(OrderReviews reviews,SharedDrafts drafts,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,Clock clock,PlatformTransactionManager manager){this.reviews=reviews;this.drafts=drafts;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.revisions=revisions;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @PostMapping ResponseEntity<Result> review(HttpServletRequest r)throws IOException{
  AuthController.noQuery(r);var input=ReviewRequests.input(r);var s=policy.select(r);String csrf=s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;
  var initial=tx.execute(status->{var p=sessions.authenticate(s.secret(),s.transport());return buyer(p.accountId(),null);});throttle.admitApi(initial.accountId(),true);
  return tx.execute(status->{var p=sessions.authenticateForWorkspace(s.secret(),s.transport(),initial.organizationId(),Set.of(input.intent().vendorId()));if(s.transport()==SessionTransport.BROWSER){sessions.requireCsrf(s.secret(),csrf);}var buyer=buyer(p.accountId(),initial.organizationId());Long draftRevision=null;if(input.draftId()!=null){var draft=drafts.read(buyer.organizationId(),input.draftId());if(!revisions.matches("draft/v1",draft.id(),draft.revision(),input.draftRevision())){throw new RevisionConflict(revisions.encode("draft/v1",draft.id(),draft.revision()));}draftRevision=draft.revision();}
   Instant at=clock.instant().truncatedTo(ChronoUnit.MILLIS);var result=reviews.create(buyer.accountId(),buyer.organizationId(),buyer.country(),new OrderReviews.Request(input.intent(),input.draftId(),draftRevision),at);sessions.recordSuccessfulActivity(s.secret(),s.transport());return ResponseEntity.status(201).header("Location","/api/v1/order-reviews/"+result.id()).body(result(result));});
 }
 private BusinessScope buyer(UUID actor,UUID expected){var m=memberships.lockForAuthorization(actor).orElseThrow(()->new ReviewFailure(ReviewFailure.Reason.NOT_FOUND,null));if(m.type()!=OrganizationType.BUYER||expected!=null&&!expected.equals(m.organizationId())){throw new ReviewFailure(ReviewFailure.Reason.NOT_FOUND,null);}return authorization.require(actor,m.organizationId(),m.country(),BusinessCapability.PREPARE_BUYER_ORDER);}
 private static String money(BigDecimal n){return n==null?null:n.setScale(2).toPlainString();}
 static Result result(OrderReviews.Result r){return new Result(r.id(),AccountResponses.time(r.expiresAt()),r.intent(),r.lines().stream().map(l->{var p=l.price();var a=p.appliedPromotion();return new Line(l.productId(),l.sku(),l.name(),l.unitName(),l.packDescription(),l.quantity(),new Price(money(p.baseUnitPrice()),money(p.normalUnitPrice()),money(p.agreedUnitPrice()),p.promotionId(),money(p.finalUnitPrice()),money(p.lineTotal()),a==null?null:new Promotion(a.id(),a.name(),a.kind(),money(a.value())),p.reachedTierThreshold(),p.agreedPriceId()));}).toList(),r.deliveryAddress(),r.deliveryContact(),r.currency(),"NET_EXCLUDING_VAT",money(r.goodsTotal()),r.deliveryInstructions());}
 record Promotion(UUID id,String name,String kind,String value){}
 record Price(String baseUnitPrice,String normalUnitPrice,String agreedUnitPrice,UUID promotionId,String finalUnitPrice,String lineTotal,Promotion appliedPromotion,Integer reachedTierThreshold,UUID agreedPriceId){}
 record Line(UUID productId,String sku,String name,String unitName,String packDescription,int quantity,Price price){}
 record Result(UUID id,String expiresAt,SharedDrafts.Intent intent,List<Line> lines,OrganizationRecord.Address deliveryAddress,SharedDrafts.Contact deliveryContact,String currency,String priceBasis,String goodsTotal,String deliveryInstructions){}
}
