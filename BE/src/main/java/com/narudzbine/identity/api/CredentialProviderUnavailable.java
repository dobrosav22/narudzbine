package com.narudzbine.identity.api;

public final class CredentialProviderUnavailable extends RuntimeException {
    public CredentialProviderUnavailable() {
        super("Credential verification is temporarily unavailable.");
    }
}
