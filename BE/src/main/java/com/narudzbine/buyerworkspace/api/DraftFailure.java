package com.narudzbine.buyerworkspace.api;
import java.util.UUID;
public final class DraftFailure extends RuntimeException {
 public enum Reason{NOT_FOUND,IDEMPOTENCY_MISMATCH,REPLAY_EXPIRED,INVALID_STATE}
 private final Reason reason;private final UUID resourceId;
 public DraftFailure(Reason reason,UUID resourceId){super("Draft operation could not be completed.");this.reason=reason;this.resourceId=resourceId;}
 public Reason reason(){return reason;}public UUID resourceId(){return resourceId;}
}
