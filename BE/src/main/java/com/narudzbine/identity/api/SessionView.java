package com.narudzbine.identity.api;

import java.time.Instant;
import java.util.UUID;

public record SessionView(UUID id, String deviceLabel, Instant createdAt, Instant lastActivityAt,
        Instant expiresAt, boolean current) {
}
