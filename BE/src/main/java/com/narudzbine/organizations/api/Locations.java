package com.narudzbine.organizations.api;

import java.util.List;
import java.util.UUID;

/** Caller owns current authorization and the organization guard for the whole transaction. */
public interface Locations {
    java.util.Optional<LocationRecord> find(UUID organizationId, UUID id);
    LocationRecord read(UUID organizationId, UUID id);
    Page list(UUID organizationId, int page, int size, String state, boolean total);
    Creation create(UUID actor, UUID organizationId, UUID id, LocationRecord.Values values, byte[] digest);
    LocationRecord replace(UUID actor, UUID organizationId, UUID id, LocationRecord.Values values);
    LocationRecord state(UUID actor, UUID organizationId, UUID id, boolean archived);
    void compactExpiredReceipts();
    record Page(List<LocationRecord> items, Long total) { }
    record Creation(LocationRecord location, boolean replay) { }
}
