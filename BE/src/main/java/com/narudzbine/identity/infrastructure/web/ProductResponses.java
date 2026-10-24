package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.catalogue.api.VendorProducts.Item;
import com.narudzbine.shared.api.ResourceRevisions;
final class ProductResponses {
 static ProductController.Result result(Item p,ResourceRevisions revisions){var v=p.values();return new ProductController.Result(p.id(),revisions.encode("product/v1",p.id(),p.revision()),v.sku(),v.name(),v.description(),v.unitId(),v.packDescription(),v.categoryId(),v.tagIds(),v.minimumQuantity(),v.quantityStep(),p.state(),p.featured(),p.unitAndPackFrozen(),p.galleryAssetIds(),AccountResponses.time(p.createdAt()),AccountResponses.time(p.updatedAt()));}
}
