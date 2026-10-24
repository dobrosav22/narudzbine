package com.narudzbine.pricing.api;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
/** Mutations require current vendor authority/guard. Evaluation also permits current active domestic buyer authority under both party guards; target-bearing results stay internal. */
public interface VendorPromotions {
 enum Kind { PERCENTAGE,FIXED_UNIT_PRICE }
 enum Mode { ALL,SELECTED }
 record Values(String name,Kind kind,BigDecimal value,Mode productMode,List<UUID> productIds,List<UUID> categoryIds,Mode buyerMode,List<UUID> buyerIds,Instant startsAt,Instant endsAt){}
 record Label(UUID id,String name){}
 record Labels(List<Label> products,List<Label> categories,List<Label> buyers){}
 record Item(UUID id,long revision,Values values,Labels labels,String state,boolean archived,Instant createdAt,Instant updatedAt){}
 record Creation(Item item,boolean replay){}
 record Page(List<Item> items,Long total){}
 record Outcome(BigDecimal unitPrice,Item promotion){}
    /** System maintenance only: clear expired replay payloads; retain original business/source identity. */
    void compactExpiredCreations();
 Item get(UUID vendor,UUID id);
 Page list(UUID vendor,int page,int size,boolean total,String state);
 Creation create(UUID actor,UUID vendor,UUID id,Values values,byte[] digest);
 Item replace(UUID actor,UUID vendor,UUID id,Values values);
 Item stop(UUID actor,UUID vendor,UUID id);
 Item archive(UUID actor,UUID vendor,UUID id);
 /** Exact candidate calculation only; does not assert product/order eligibility. */
 List<Item> savingCandidates(UUID vendor,UUID buyer,UUID product,BigDecimal resolvedUnitPrice,Instant at);
 Outcome evaluate(UUID vendor,UUID buyer,UUID product,BigDecimal resolvedUnitPrice);

 default Map<UUID,List<Item>> savingCandidatesMany(UUID vendor,UUID buyer,Map<UUID,BigDecimal> resolved,Instant at){
  if(resolved.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var result=new LinkedHashMap<UUID,List<Item>>();resolved.forEach((id,price)->result.put(id,savingCandidates(vendor,buyer,id,price,at)));return Map.copyOf(result);
 }
}
