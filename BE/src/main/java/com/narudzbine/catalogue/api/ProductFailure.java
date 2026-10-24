package com.narudzbine.catalogue.api;
import java.util.UUID;
public final class ProductFailure extends RuntimeException {
 public enum Reason{NOT_FOUND,SKU_RESERVED,PLAN_LIMIT_EXCEEDED,INVALID_REFERENCE,IDEMPOTENCY_MISMATCH,REPLAY_EXPIRED,PRODUCT_UNIT_PACK_FROZEN,INVALID_STATE,UNIT_REQUIRED,BASE_PRICE_REQUIRED,STOCK_CONFIRMATION_REQUIRED,DEACTIVATION_REQUIRED}
 private final Reason reason;private final String field;private final UUID resourceId;
 public ProductFailure(Reason reason,String field,UUID resourceId){super(reason.name());this.reason=reason;this.field=field;this.resourceId=resourceId;}
 public Reason reason(){return reason;}public String field(){return field;}public UUID resourceId(){return resourceId;}
}
