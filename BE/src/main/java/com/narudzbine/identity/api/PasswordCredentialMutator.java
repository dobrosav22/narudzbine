package com.narudzbine.identity.api;

import java.util.UUID;

/** Never retry a write on an uncertain result. Reconciliation must be read-only and positively identify the operation. */
public interface PasswordCredentialMutator {
    enum Outcome { APPLIED, POLICY_REJECTED, REJECTED, UNKNOWN }
    Outcome change(PasswordCredentialVerifier.Subject subject, UUID operation, String password);
    Outcome reconcile(PasswordCredentialVerifier.Subject subject, UUID operation);
}
