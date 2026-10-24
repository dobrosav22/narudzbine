package com.narudzbine.pricing.api;
import java.math.BigDecimal;
import java.util.*;
/** Caller holds both relationship organization guards and current price authorization in the committing transaction. */
public interface AgreedPrices {
 record Item(UUID id,long revision,UUID productId,UUID buyerOrganizationId,BigDecimal unitPrice,boolean confirmationRequired){}
 record Page(List<Item> items,Long total,long pricingRevision){}
 record VendorPage(List<Item> items,Long total){}
 VendorPage listVendor(UUID vendor,int page,int size,boolean total);
 Page list(UUID vendor,UUID relationship,int page,int size,boolean total);
 Optional<Item> find(UUID vendor,UUID relationship,UUID product);
 Item set(UUID actor,UUID vendor,UUID relationship,UUID product,Long expectedRevision,BigDecimal price);
 void remove(UUID actor,UUID vendor,UUID relationship,UUID product,long expectedRevision);
 void confirm(UUID actor,UUID vendor,UUID relationship,long expectedRelationship,long expectedPricing,List<UUID> products);

 default Map<UUID,Item> findMany(UUID vendor,UUID relationship,Collection<UUID> ids){
  if(ids.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var result=new LinkedHashMap<UUID,Item>();for(UUID id:ids)find(vendor,relationship,id).ifPresent(item->result.put(id,item));return Map.copyOf(result);
 }
}
