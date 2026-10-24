package com.narudzbine.identity.api;

import com.narudzbine.organizations.api.BusinessRole;
import com.narudzbine.organizations.api.Country;
import com.narudzbine.organizations.api.OrganizationType;
import java.util.UUID;

/** Facts valid for the transaction that acquired them; never cache as a session permission snapshot. */
public record BusinessScope(UUID accountId, UUID organizationId, Country country,
        OrganizationType organizationType, BusinessRole role) {
}
