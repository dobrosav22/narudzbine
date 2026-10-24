package com.narudzbine.pricing.api;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
/** Caller holds both organization guards and current active domestic buyer connection authority. */
public interface BuyerPricing {
 record Summary(UUID id,String name,VendorPromotions.Kind kind,BigDecimal value,Instant startsAt,Instant endsAt,Instant createdAt){}
 record Quote(BigDecimal base,BigDecimal normal,BigDecimal agreed,Integer reachedTier,UUID agreedPriceId,BigDecimal unitPrice,BigDecimal lineTotal,Summary applied,List<Summary> promotions,List<BasePricing.Tier> tiers,String currency){}
 Quote resolve(UUID vendor,UUID buyer,UUID product,int quantity,Instant at);

 default Map<UUID,Quote> resolveMany(UUID vendor,UUID buyer,Map<UUID,Integer> quantities,Instant at){
  if(quantities.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var result=new LinkedHashMap<UUID,Quote>();quantities.forEach((id,quantity)->result.put(id,resolve(vendor,buyer,id,quantity,at)));return Map.copyOf(result);
 }
}
