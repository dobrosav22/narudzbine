package com.narudzbine.identity.api;

import com.narudzbine.organizations.api.Country;
import java.util.UUID;

public interface BusinessAuthorization {
    /** Requires a trusted authenticated identity and holds authorization locks through the caller's transaction. */
    BusinessScope require(UUID authenticatedAccountId, UUID targetOrganizationId, Country targetCountry,
            BusinessCapability capability);
}
