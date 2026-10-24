package com.narudzbine.ordering.api;
import java.util.UUID;
public final class StageFailure extends RuntimeException {
 public enum Reason{NOT_FOUND,DUPLICATE_NAME,RESERVED_NAME,LIMIT_EXCEEDED,INVALID_STATE,INVALID_ORDER,IDEMPOTENCY_MISMATCH,REPLAY_EXPIRED,REVISION_CONFLICT}
 private final Reason reason;private final UUID resource;private final long revision;private final String domain;
 public StageFailure(Reason reason){this(reason,null,0,null);}
 public StageFailure(Reason reason,UUID resource,long revision,String domain){super("Order stage operation unavailable");this.reason=reason;this.resource=resource;this.revision=revision;this.domain=domain;}
 public Reason reason(){return reason;}public UUID resource(){return resource;}public long revision(){return revision;}public String domain(){return domain;}
}
