package com.narudzbine.pricing.application;
import com.narudzbine.pricing.api.*;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.trading.api.TradingConnections;
import java.math.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class DefaultBuyerPricing implements BuyerPricing {
 private final BasePricing pricing;private final AgreedPrices agreements;private final VendorPromotions promotions;private final TradingConnections trading;private final ProductPricingContext products;
 public DefaultBuyerPricing(BasePricing pricing,AgreedPrices agreements,VendorPromotions promotions,TradingConnections trading,ProductPricingContext products){this.pricing=pricing;this.agreements=agreements;this.promotions=promotions;this.trading=trading;this.products=products;}
 public Quote resolve(UUID vendor,UUID buyer,UUID product,int quantity,Instant at){
  var relationship=active(vendor,buyer);validate(product,quantity,products.require(vendor,product));
  var resolved=select(pricing.read(vendor,product),agreements.find(vendor,relationship.id(),product),quantity);
  return quote(resolved,promotions.savingCandidates(vendor,buyer,product,resolved.amount(),at),quantity);
 }
 @Override public Map<UUID,Quote> resolveMany(UUID vendor,UUID buyer,Map<UUID,Integer> quantities,Instant at){
  if(quantities.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");if(quantities.isEmpty())return Map.of();
  var relationship=active(vendor,buyer);var rules=products.requireMany(vendor,quantities.keySet());
  quantities.forEach((id,quantity)->validate(id,quantity,rules.get(id)));
  var bases=pricing.readMany(vendor,quantities.keySet());var agreed=agreements.findMany(vendor,relationship.id(),quantities.keySet());
  var selected=new LinkedHashMap<UUID,Resolved>();var amounts=new LinkedHashMap<UUID,BigDecimal>();
  for(var entry:quantities.entrySet()){var item=select(bases.get(entry.getKey()),Optional.ofNullable(agreed.get(entry.getKey())),entry.getValue());selected.put(entry.getKey(),item);amounts.put(entry.getKey(),item.amount());}
  var candidates=promotions.savingCandidatesMany(vendor,buyer,amounts,at);var result=new LinkedHashMap<UUID,Quote>();
  quantities.forEach((id,quantity)->result.put(id,quote(selected.get(id),Objects.requireNonNull(candidates.get(id)),quantity)));return Map.copyOf(result);
 }
 private TradingConnections.View active(UUID vendor,UUID buyer){var relationship=trading.find(vendor,buyer).orElseThrow(DefaultBuyerPricing::missing);if(!relationship.state().equals("ACTIVE"))throw missing();return relationship;}
 private static void validate(UUID product,int quantity,ProductPricingContext.Rules rules){
  if(rules==null||!rules.state().equals("ACTIVE"))throw missing();
  if(quantity<rules.minimum()||quantity>1000000000||(quantity-rules.minimum())%rules.step()!=0)throw new PricingFailure(PricingFailure.Reason.INVALID_QUANTITY,List.of("/quantity"),product,null);
 }
 private record Resolved(BasePricing.Item price,BigDecimal normal,Integer threshold,Optional<AgreedPrices.Item> agreement,BigDecimal amount){}
 private static Resolved select(BasePricing.Item price,Optional<AgreedPrices.Item> agreement,int quantity){
  BigDecimal base=price.values().basePrice();if(base==null)throw missing();BigDecimal normal=base;Integer threshold=null;
  for(var tier:price.values().tiers()){if(quantity<tier.minimumQuantity())break;normal=tier.unitPrice();threshold=tier.minimumQuantity();}
  var confirmed=agreement.filter(a->!a.confirmationRequired());return new Resolved(price,normal,threshold,confirmed,confirmed.map(AgreedPrices.Item::unitPrice).orElse(normal));
 }
 private static Quote quote(Resolved selected,List<VendorPromotions.Item> candidates,int quantity){
  BigDecimal best=selected.amount();Summary applied=null;var summaries=new ArrayList<Summary>();
  for(var item:candidates){var v=item.values();var summary=new Summary(item.id(),v.name(),v.kind(),v.value().setScale(2),v.startsAt(),v.endsAt(),item.createdAt());summaries.add(summary);
   BigDecimal candidate=(v.kind()==VendorPromotions.Kind.FIXED_UNIT_PRICE?v.value():selected.amount().multiply(BigDecimal.ONE.subtract(v.value().movePointLeft(2)))).max(BigDecimal.ZERO).setScale(2,RoundingMode.HALF_UP);
   if(candidate.compareTo(best)<0){best=candidate;applied=summary;}
  }
  return new Quote(selected.price().values().basePrice(),selected.normal(),selected.agreement().map(AgreedPrices.Item::unitPrice).orElse(null),selected.threshold(),selected.agreement().map(AgreedPrices.Item::id).orElse(null),best,best.multiply(BigDecimal.valueOf(quantity)).setScale(2),applied,List.copyOf(summaries),selected.price().values().tiers(),selected.price().currency());
 }
 private static ProductFailure missing(){return new ProductFailure(ProductFailure.Reason.NOT_FOUND,null,null);}
}
