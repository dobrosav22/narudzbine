package com.narudzbine.ordering.api;
import java.util.UUID;
public final class OrderFailure extends RuntimeException {
 public enum Reason{NOT_FOUND,INVALID_LOCATION,INVALID_STATE,IDEMPOTENCY_MISMATCH,REQUEST_IN_PROGRESS,REPLAY_EXPIRED}
 private final Reason reason;private final UUID resource;
 public OrderFailure(Reason reason){this(reason,null);}
 public OrderFailure(Reason reason,UUID resource){super("Order operation unavailable");this.reason=reason;this.resource=resource;}
 public Reason reason(){return reason;}public UUID resource(){return resource;}
}
