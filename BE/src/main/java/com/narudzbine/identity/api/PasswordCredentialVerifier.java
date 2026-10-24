package com.narudzbine.identity.api;

import java.util.Optional;
import java.util.UUID;

/** Managed credential verification port. Implementations must not persist or log the password. */
public interface PasswordCredentialVerifier {
    Optional<Subject> verify(String normalizedEmail, String password);

    record Subject(UUID tenantId, UUID userId) {
    }
}
