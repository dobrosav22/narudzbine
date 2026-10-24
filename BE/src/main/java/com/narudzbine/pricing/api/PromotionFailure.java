package com.narudzbine.pricing.api;
import java.util.UUID;
public final class PromotionFailure extends RuntimeException {
 public enum Reason { NOT_FOUND,INVALID_STATE,INVALID_VALUE,INVALID_REFERENCE,IDEMPOTENCY_MISMATCH,REPLAY_EXPIRED }
 private final Reason reason;private final String field;private final UUID resource;
 public PromotionFailure(Reason reason,String field,UUID resource){super("Promotion action could not be completed.");this.reason=reason;this.field=field;this.resource=resource;}
 public Reason reason(){return reason;}public String field(){return field;}public UUID resource(){return resource;}
}
