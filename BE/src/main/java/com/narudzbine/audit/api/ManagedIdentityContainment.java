package com.narudzbine.audit.api;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Read-only evidence of the exact managed subject; never a provider mutation or erasure claim. */
public interface ManagedIdentityContainment {
    record Subject(UUID tenantId, UUID userId, String endpoint, String conformanceReference, boolean allowAbsence) {
        @Override public String toString() { return "ManagedSubject[redacted]"; }
    }
    enum State { INACTIVE, ABSENT_IN_CONFIRMED_TENANT }
    record Observation(Subject subject, State state, Instant observedAt) {
        @Override public String toString() { return "ManagedContainmentObservation[redacted]"; }
    }
    Optional<Observation> verify(Subject subject);
}
