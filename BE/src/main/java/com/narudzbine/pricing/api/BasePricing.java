package com.narudzbine.pricing.api;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
public interface BasePricing {
 record Tier(int minimumQuantity,BigDecimal unitPrice){ }
 record Values(BigDecimal basePrice,List<Tier> tiers){public Values{tiers=List.copyOf(tiers);}}
 record Item(UUID productId,long revision,Values values,String currency){ }
 Item read(UUID vendor,UUID product);
 default Item replace(UUID actor,UUID vendor,UUID product,long expectedRevision,Values values,Integer proposedMinimum,Integer proposedStep){return replace(actor,vendor,product,expectedRevision,values,proposedMinimum,proposedStep,false);}
 Item replace(UUID actor,UUID vendor,UUID product,long expectedRevision,Values values,Integer proposedMinimum,Integer proposedStep,boolean publicationChanged);
 java.util.Optional<Item> replayDeactivation(UUID actor,UUID vendor,UUID product,byte[] identity);
 void rememberDeactivation(UUID actor,UUID vendor,UUID product,byte[] identity,Item result);
 void compactExpiredDeactivations();
 BigDecimal ordinaryUnitPrice(UUID vendor,UUID product,int quantity);

 default java.util.Map<UUID,Item> readMany(UUID vendor,java.util.Collection<UUID> ids){
  if(ids.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var result=new java.util.LinkedHashMap<UUID,Item>();for(UUID id:ids)result.put(id,read(vendor,id));return java.util.Map.copyOf(result);
 }
 default void initializeImportedBases(UUID actor,UUID vendor,java.util.Map<UUID,BigDecimal> prices){if(prices.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");for(var row:prices.entrySet()){var current=read(vendor,row.getKey());replace(actor,vendor,row.getKey(),current.revision(),new Values(row.getValue(),java.util.List.of()),null,null);}}
}
