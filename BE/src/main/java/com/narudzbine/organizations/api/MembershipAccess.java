package com.narudzbine.organizations.api;

import java.util.Optional;
import java.util.UUID;

public interface MembershipAccess {
    /** Locks the derived organization then membership until the caller's transaction ends. */
    Optional<LockedMembership> lockForAuthorization(UUID accountId);
    /** Organization-wide mutations must acquire this before any account/session lock. */
    Optional<LockedMembership> lockForOrganizationWrite(UUID accountId);
}
