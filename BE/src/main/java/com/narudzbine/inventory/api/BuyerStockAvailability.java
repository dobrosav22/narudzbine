package com.narudzbine.inventory.api;
import java.util.UUID;
/** Caller holds both party guards and current active domestic buyer connection authority. No commercial write. */
public interface BuyerStockAvailability {
 record Availability(boolean tracked,Integer availableQuantity){}
 Availability forOffer(UUID vendor,UUID product);
 default java.util.Map<java.util.UUID,Availability> forOffers(java.util.UUID vendor,java.util.Collection<java.util.UUID> products){
  if(products.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");var result=new java.util.LinkedHashMap<java.util.UUID,Availability>();for(var id:products)result.put(id,forOffer(vendor,id));return java.util.Map.copyOf(result);
 }
}
