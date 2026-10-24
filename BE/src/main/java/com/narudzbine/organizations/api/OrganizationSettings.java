package com.narudzbine.organizations.api;

import java.util.UUID;

/** Caller must hold current business authorization and derive IDs from its verified session, in this transaction. */
public interface OrganizationSettings {
    OrganizationRecord read(UUID authorizedOrganizationId);
    /** Caller holds the organization exclusively before account authorization and checked the signed revision. */
    OrganizationRecord replace(UUID actorId, UUID authorizedOrganizationId, OrganizationRecord.Values values);
}
