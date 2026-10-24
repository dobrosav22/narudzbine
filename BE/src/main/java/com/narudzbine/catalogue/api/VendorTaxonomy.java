package com.narudzbine.catalogue.api;

import java.util.List;
import java.util.UUID;
public interface VendorTaxonomy {
 enum Kind { CATEGORY, TAG, UNIT }
 record Item(UUID id,long revision,String name,boolean nameFrozen,boolean deleted) { }
 record Creation(Item item,boolean replay) { }
 record Page(List<Item> items,Long total) { }
 record OfferName(UUID id,String name,Kind kind){}
 record OfferPage(List<OfferName> items,boolean more){}
 OfferPage offerNames(UUID vendor,int size,UUID after);
 Item read(UUID vendor,Kind kind,UUID id);
 Page list(UUID vendor,Kind kind,int page,int size,boolean total,String query,boolean createdSort);
 Creation create(UUID actor,UUID vendor,Kind kind,UUID id,String name,byte[] digest);
 Item rename(UUID actor,UUID vendor,Kind kind,UUID id,String name);
 void delete(UUID actor,UUID vendor,Kind kind,UUID id);
 /** Ordering must invoke in its successful submission transaction under the vendor guard. No order producer exists yet. */
 void freezeUnits(UUID vendor,List<UUID> units);
 void compactExpiredReceipts();

 default java.util.Map<UUID,Item> readMany(UUID vendor,Kind kind,java.util.Collection<UUID> ids){
  if(ids.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var result=new java.util.LinkedHashMap<UUID,Item>();for(UUID id:ids)result.put(id,read(vendor,kind,id));return java.util.Map.copyOf(result);
 }
}
