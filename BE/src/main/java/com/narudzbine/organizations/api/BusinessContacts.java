package com.narudzbine.organizations.api;

import java.util.List;
import java.util.UUID;

/** Caller owns current authorization and the organization guard for the entire transaction. */
public interface BusinessContacts {
    BusinessContactRecord read(UUID organizationId, UUID id);
    Page list(UUID organizationId, int page, int size, String state, boolean total);
    Creation create(UUID actor, UUID organizationId, UUID id, BusinessContactRecord.Values values, byte[] digest);
    BusinessContactRecord replace(UUID actor, UUID organizationId, UUID id, BusinessContactRecord.Values values);
    BusinessContactRecord state(UUID actor, UUID organizationId, UUID id, boolean archived);
    void compactExpiredReceipts();
    record Page(List<BusinessContactRecord> items, Long total) { }
    record Creation(BusinessContactRecord contact, boolean replay) { }
}
