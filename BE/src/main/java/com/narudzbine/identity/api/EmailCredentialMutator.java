package com.narudzbine.identity.api;

import java.util.UUID;

public interface EmailCredentialMutator {
    enum Outcome { APPLIED, REJECTED, UNKNOWN }
    Outcome change(PasswordCredentialVerifier.Subject subject,UUID operation,String oldEmail,String newEmail);
    Outcome reconcile(PasswordCredentialVerifier.Subject subject,UUID operation,String oldEmail,String newEmail);
}
