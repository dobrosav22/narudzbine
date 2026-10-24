package com.narudzbine.ordering.api;
import com.narudzbine.buyerworkspace.api.SharedDrafts;
import com.narudzbine.organizations.api.Country;
import com.narudzbine.organizations.api.OrganizationRecord;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
/** Caller owns current buyer authority and sorted party guards for all business reads/writes. */
public interface OrderReviews {
 record Request(SharedDrafts.Intent intent,UUID draftId,Long draftRevision){}
 record Promotion(UUID id,String name,String kind,BigDecimal value){}
 record Price(BigDecimal baseUnitPrice,BigDecimal normalUnitPrice,BigDecimal agreedUnitPrice,UUID promotionId,BigDecimal finalUnitPrice,BigDecimal lineTotal,Promotion appliedPromotion,Integer reachedTierThreshold,UUID agreedPriceId){}
 record Line(UUID productId,String sku,String name,String unitName,String packDescription,int quantity,Price price){}
 record Result(UUID id,Instant expiresAt,SharedDrafts.Intent intent,List<Line> lines,OrganizationRecord.Address deliveryAddress,SharedDrafts.Contact deliveryContact,String deliveryInstructions,String currency,BigDecimal goodsTotal){public Result{lines=List.copyOf(lines);}}
 record Receipt(UUID buyerId,UUID vendorId,UUID creatorId,UUID relationshipId,long relationshipGeneration,UUID draftId,Long draftRevision,Instant createdAt,Result result,byte[] termsHash){}
 record Issue(UUID productId,String path,String code,ReviewFailure.Reason reason){}
 record Evaluation(Result result,List<Issue> issues,UUID relationshipId,long relationshipGeneration){public Evaluation{issues=List.copyOf(issues);}}
 java.util.Optional<UUID> vendor(UUID buyer,UUID review);
 Evaluation evaluate(UUID buyer,Country country,SharedDrafts.Intent intent,Instant at);
 boolean sameTerms(Receipt receipt,Evaluation current);
 Result save(UUID actor,UUID buyer,Country country,Request request,Evaluation evaluated,Instant at);
 Result create(UUID actor,UUID buyer,Country country,Request request,Instant at);
 Receipt read(UUID buyer,UUID id,Instant at);
 int purgeExpired();
}
