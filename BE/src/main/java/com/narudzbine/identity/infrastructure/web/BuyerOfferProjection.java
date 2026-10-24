package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.pricing.api.BuyerPricing;
import com.narudzbine.inventory.api.BuyerStockAvailability;
import com.narudzbine.shared.api.ResourceRevisions;
import com.narudzbine.identity.infrastructure.web.BuyerOffersController.*;
import java.util.*;
import java.time.Instant;
import org.springframework.stereotype.Component;
/** Current connected buyer authority and sorted organization guards must precede this projection. */
@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
final class BuyerOfferProjection {
 private final VendorTaxonomy taxonomy;private final BuyerPricing pricing;private final BuyerStockAvailability stock;private final ResourceRevisions revisions;
 BuyerOfferProjection(VendorTaxonomy taxonomy,BuyerPricing pricing,BuyerStockAvailability stock,ResourceRevisions revisions){this.taxonomy=taxonomy;this.pricing=pricing;this.stock=stock;this.revisions=revisions;}
 Offer offer(UUID buyer,UUID vendor,VendorProducts.Item product,int quantity,Instant at){
  var values=product.values();var quote=pricing.resolve(vendor,buyer,product.id(),quantity,at);var availability=stock.forOffer(vendor,product.id());var unit=taxonomy.read(vendor,VendorTaxonomy.Kind.UNIT,values.unitId());
  Named category=values.categoryId()==null?null:named(taxonomy.read(vendor,VendorTaxonomy.Kind.CATEGORY,values.categoryId()));
  var tags=values.tagIds().stream().map(id->named(taxonomy.read(vendor,VendorTaxonomy.Kind.TAG,id))).toList();return project(vendor,product,quantity,at,quote,availability,unit.name(),category,tags);
 }
 List<Offer> offers(UUID buyer,UUID vendor,List<VendorProducts.Item> items,Instant at){
  if(items.isEmpty())return List.of();var quantities=new LinkedHashMap<UUID,Integer>();items.forEach(item->quantities.put(item.id(),item.values().minimumQuantity()));
  var quotes=pricing.resolveMany(vendor,buyer,quantities,at);var availability=stock.forOffers(vendor,quantities.keySet());
  var units=names(vendor,VendorTaxonomy.Kind.UNIT,items.stream().map(item->item.values().unitId()).toList());
  var categories=names(vendor,VendorTaxonomy.Kind.CATEGORY,items.stream().map(item->item.values().categoryId()).filter(Objects::nonNull).toList());
  var tags=names(vendor,VendorTaxonomy.Kind.TAG,items.stream().flatMap(item->item.values().tagIds().stream()).toList());
  return items.stream().map(item->project(vendor,item,item.values().minimumQuantity(),at,quotes.get(item.id()),availability.get(item.id()),units.get(item.values().unitId()).name(),item.values().categoryId()==null?null:named(categories.get(item.values().categoryId())),item.values().tagIds().stream().map(id->named(tags.get(id))).toList())).toList();
 }
 private Map<UUID,VendorTaxonomy.Item> names(UUID vendor,VendorTaxonomy.Kind kind,List<UUID> supplied){
  var selected=supplied.stream().distinct().toList();var result=new LinkedHashMap<UUID,VendorTaxonomy.Item>();
  for(int start=0;start<selected.size();start+=1000)result.putAll(taxonomy.readMany(vendor,kind,selected.subList(start,Math.min(start+1000,selected.size()))));return Map.copyOf(result);
 }
 private Offer project(UUID vendor,VendorProducts.Item product,int quantity,Instant at,BuyerPricing.Quote quote,BuyerStockAvailability.Availability availability,String unitName,Named category,List<Named> tags){
  var applied=quote.applied();var resolution=new Resolution(money(quote.base()),money(quote.normal()),money(quote.agreed()),applied==null?null:applied.id(),money(quote.unitPrice()),money(quote.lineTotal()),applied==null?null:new Snapshot(applied.id(),applied.name(),applied.kind().name(),money(applied.value())),quote.reachedTier(),quote.agreedPriceId());
  return new Offer(ProductResponses.result(product,revisions),vendor,unitName,quote.currency(),"NET_EXCLUDING_VAT",money(quote.base()),money(quote.agreed()),quote.tiers().stream().map(tier->new Tier(tier.minimumQuantity(),money(tier.unitPrice()))).toList(),availability.tracked(),availability.availableQuantity(),category,tags,quote.promotions().stream().map(promotion->new Promotion(promotion.id(),promotion.name(),promotion.kind().name(),money(promotion.value()),AccountResponses.time(promotion.startsAt()),AccountResponses.time(promotion.endsAt()),AccountResponses.time(promotion.createdAt()))).toList(),quantity,resolution,AccountResponses.time(at));
 }
 private static Named named(VendorTaxonomy.Item n){return new Named(n.id(),n.name());}
 private static String money(java.math.BigDecimal n){return n==null?null:n.setScale(2).toPlainString();}
}
