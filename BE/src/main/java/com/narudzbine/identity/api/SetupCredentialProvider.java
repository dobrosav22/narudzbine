package com.narudzbine.identity.api;

import java.util.UUID;

/** Candidate is not a verified mapping until positive APPLIED confirmation. Password is request memory only. */
public interface SetupCredentialProvider {
    enum Outcome { APPLIED, POLICY_REJECTED, UNKNOWN }
    UUID tenant();
    Outcome create(PasswordCredentialVerifier.Subject candidate,UUID operation,String email,String password);
    Outcome reconcile(PasswordCredentialVerifier.Subject candidate,UUID operation,String email);
}
