package com.narudzbine.audit.api;
import java.util.List;
import java.util.UUID;
public interface ProductAudit {
 enum Action{PRODUCT_CREATED,PRODUCT_UPDATED,PRODUCT_ARCHIVED,PRODUCT_RESTORED,PRODUCT_ACTIVATED,PRODUCT_DEACTIVATED}
 enum Field{sku,name,description,unitId,packDescription,categoryId,tagIds,minimumQuantity,quantityStep,state,galleryAssetIds,featured}
 void product(UUID actor,UUID resource,Action action,List<Field> fields);
}
