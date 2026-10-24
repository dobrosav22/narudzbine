package com.narudzbine.catalogue.api;
import java.util.UUID;
public interface ProductStockPolicy {boolean importTracking(UUID vendor);void requireActivationStock(UUID vendor,UUID product); default void requireActivationMany(UUID vendor,java.util.List<UUID> ids){if(ids.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");for(UUID id:ids)requireActivationStock(vendor,id);}
}
