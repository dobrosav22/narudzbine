package com.narudzbine.organizations.api;

import java.time.Instant;
import java.util.UUID;

public record BusinessContactRecord(UUID id, long revision, String label, LocationRecord.Contact contact,
        String state, Instant createdAt, Instant updatedAt) {
    public record Values(String label, LocationRecord.Contact contact) { }
}
