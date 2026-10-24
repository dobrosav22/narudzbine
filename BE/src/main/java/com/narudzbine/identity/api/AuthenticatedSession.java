package com.narudzbine.identity.api;

import java.time.Instant;
import java.util.UUID;

/** Valid only within the transaction that acquired it; current business permissions must still be checked. */
public record AuthenticatedSession(UUID sessionId, UUID accountId, boolean platformAdministrator,
        Instant authenticatedAt) {
}
