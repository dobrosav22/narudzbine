package com.narudzbine.inventory.api;
public final class InventoryFailure extends RuntimeException {
 public enum Reason{NOT_FOUND,COUNT_REQUIRED,INVALID_COUNT,REQUEST_IN_PROGRESS,IDEMPOTENCY_MISMATCH,REPLAY_EXPIRED,TRACKING_ENABLED,PREVIEW_STALE,PREVIEW_EXPIRED,PREVIEW_APPLIED,REVIEW_INCOMPLETE}
 private final Reason reason;private final String field;
 public InventoryFailure(Reason reason,String field){super("Inventory operation could not be completed.");this.reason=reason;this.field=field;}
 public Reason reason(){return reason;}public String field(){return field;}
}
