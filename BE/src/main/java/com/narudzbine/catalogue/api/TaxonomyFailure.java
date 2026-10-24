package com.narudzbine.catalogue.api;

import java.util.UUID;
public final class TaxonomyFailure extends RuntimeException {
 public enum Reason { NOT_FOUND,DUPLICATE_NAME,IDEMPOTENCY_MISMATCH,REPLAY_EXPIRED,RESOURCE_REFERENCED,UNIT_NAME_FROZEN }
 private final Reason reason; private final UUID resourceId;
 public TaxonomyFailure(Reason reason,UUID resourceId){super(reason.name());this.reason=reason;this.resourceId=resourceId;}
 public Reason reason(){return reason;} public UUID resourceId(){return resourceId;}
}
