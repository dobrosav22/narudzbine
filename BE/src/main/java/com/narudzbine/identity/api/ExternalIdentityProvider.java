package com.narudzbine.identity.api;

import java.time.Instant;

/** Trusted OIDC boundary; never accept issuer/subject or token claims from a client request. */
public interface ExternalIdentityProvider {
    enum Provider { GOOGLE, APPLE }
    enum Purpose { LOGIN, LINK, REAUTHENTICATE }
    String authorization(Provider provider,Purpose purpose,String state,String verifier,String nonce);
    Subject verify(Provider provider,Purpose purpose,String state,String code,String verifier,String nonce,Instant startedAt);
    record Subject(String issuer,String subject) { @Override public String toString() { return "ExternalSubject[redacted]"; } }
}
