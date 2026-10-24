package com.narudzbine.organizations.api;

import java.util.UUID;

/** Current membership facts; not an authentication proof or a transferable authorization grant. */
public record LockedMembership(UUID organizationId, Country country, OrganizationType type,
        BusinessRole role, boolean organizationActive, boolean staffSubmissionRestricted) {
}
