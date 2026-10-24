package com.narudzbine.identity.api;

import java.time.Instant;
import java.util.UUID;

/** Trusted provider-adapter output, never a client request or a substitute for provider password verification. */
public record VerifiedPasswordProof(UUID accountId, long securityEpoch, long credentialGeneration,
        Instant authenticatedAt) {
}
