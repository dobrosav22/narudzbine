package com.narudzbine.organizations.api;

import java.time.Instant;
import java.util.UUID;

public record LocationRecord(UUID id, long revision, String name, OrganizationRecord.Address address,
        Contact contact, String instructions, String state, Instant createdAt, Instant updatedAt) {
    public record Contact(String name, String phone, String email) { }
    public record Values(String name, OrganizationRecord.Address address, Contact contact, String instructions) { }
    public Values values() { return new Values(name, address, contact, instructions); }
}
