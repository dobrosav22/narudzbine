package com.narudzbine.catalogue.api;
import java.util.UUID;
public interface ProductPricingContext {
 record Rules(int minimum,int step,String state,String currency){ }
 Rules require(UUID vendor,UUID product);

 default java.util.Map<UUID,Rules> requireMany(UUID vendor,java.util.Collection<UUID> ids){
  if(ids.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var result=new java.util.LinkedHashMap<UUID,Rules>();for(UUID id:ids)result.put(id,require(vendor,id));return java.util.Map.copyOf(result);
 }
}
