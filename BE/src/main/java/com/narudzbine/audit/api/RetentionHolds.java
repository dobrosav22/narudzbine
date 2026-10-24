package com.narudzbine.audit.api;

import java.util.UUID;

public interface RetentionHolds {
    record Context(String reason, String caseReference) {
        @Override public String toString() { return "HoldContext[redacted]"; }
    }
    record View(UUID id, UUID caseId, UUID organizationId, String country, String policy,
                String state, String revision, String createdAt, String releasedAt) {}
    View activate(PrivateCaseReview.Actor actor, UUID caseId, PrivateCaseReview.Target target, UUID id, Context context);
    View read(PrivateCaseReview.Actor actor, UUID caseId, UUID id);
    View release(PrivateCaseReview.Actor actor, UUID caseId, UUID id, String expectedRevision, Context context);
}
