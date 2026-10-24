package com.narudzbine.catalogue.api;
import java.util.UUID;
public interface ProductPricingPolicy {
 void requireActivationPrice(UUID vendor,UUID product);
 void requireCompatible(UUID vendor,UUID product,int minimum,int step);
 default void requireActivationMany(UUID vendor,java.util.List<UUID> ids){if(ids.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");for(UUID id:ids)requireActivationPrice(vendor,id);}
}
