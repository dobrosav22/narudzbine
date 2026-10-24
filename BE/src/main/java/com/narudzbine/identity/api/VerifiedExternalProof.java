package com.narudzbine.identity.api;

import java.time.Instant;
import java.util.UUID;

/** Server-only provider proof tied to current local account and immutable method identity. */
public record VerifiedExternalProof(UUID accountId,long securityEpoch,long credentialGeneration,UUID identityId,Instant authenticatedAt) { }
