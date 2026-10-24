package com.narudzbine.audit.api;
import java.util.List;
import java.util.UUID;
public interface PricingAudit {
 enum Field{basePrice,tiers}
 void agreedPricesReviewed(UUID actor,UUID relationship);
 void agreedPrice(UUID actor,UUID price,String action);
 void promotion(UUID actor,UUID promotion,String action);
 void pricing(UUID actor,UUID product,List<Field> fields);
}
