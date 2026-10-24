package com.narudzbine.catalogue.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
public interface VendorProducts {
 record Values(String sku,String name,String description,UUID unitId,String packDescription,UUID categoryId,List<UUID> tagIds,int minimumQuantity,int quantityStep){public Values{tagIds=List.copyOf(tagIds);}}
 record Item(UUID id,long revision,Values values,String state,boolean featured,boolean unitAndPackFrozen,List<UUID> galleryAssetIds,Instant createdAt,Instant updatedAt){ }
 record Creation(Item item,boolean replay){ }
 record Query(int page,int size,boolean total,String query,boolean createdSort,String state,UUID categoryId,UUID tagId){ }
 record Page(List<Item> items,Long total){ }
 /** Routing only, never authorization or a buyer-visible projection. */
 java.util.Optional<UUID> vendorForProduct(UUID id);
 java.util.Optional<Item> find(UUID vendor,UUID id);
 Item read(UUID vendor,UUID id);
 Page list(UUID vendor,Query query);
 Page published(UUID vendor,Query query,Boolean featured);
 Creation create(UUID actor,UUID vendor,UUID id,Values values,byte[] digest);
 record NewProduct(UUID id,Values values,byte[] digest){public NewProduct{digest=digest.clone();}@Override public byte[] digest(){return digest.clone();}}
 default void createMany(UUID actor,UUID vendor,List<NewProduct> rows){if(rows.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");for(var row:rows)create(actor,vendor,row.id(),row.values(),row.digest());}
 default void activateMany(UUID actor,UUID vendor,List<UUID> ids){if(ids.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");for(UUID id:ids)publication(actor,vendor,id,true);}
 Item replace(UUID actor,UUID vendor,UUID id,Values values);
 Item featured(UUID actor,UUID vendor,UUID id,boolean featured);
 Item gallery(UUID actor,UUID vendor,UUID id,List<UUID> assetIds);
 Item publication(UUID actor,UUID vendor,UUID id,boolean active);
 Item state(UUID actor,UUID vendor,UUID id,boolean archived);
 /** Ordering must call inside its successful transaction under organization guards, before snapshots. */
 void freezeProducts(UUID vendor,List<UUID> products);
 void compactExpiredReceipts();

 /** Transaction-scoped vendor projection; missing/foreign IDs are absent. */
 default java.util.Map<UUID,Item> findMany(UUID vendor,java.util.Collection<UUID> ids){
  if(ids.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var result=new java.util.LinkedHashMap<UUID,Item>();for(UUID id:ids)find(vendor,id).ifPresent(item->result.put(id,item));return java.util.Map.copyOf(result);
 }
}
