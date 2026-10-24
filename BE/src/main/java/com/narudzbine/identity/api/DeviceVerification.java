package com.narudzbine.identity.api;

import java.time.Instant;
import java.util.UUID;

/** Trusted project AND possession verification, outside any database transaction. No token-syntax inference. */
public interface DeviceVerification {
    Proof verify(Request request);
    default Outcome verifyOrChallenge(Request request,UUID verificationId,String code) { return new Outcome(verify(request),null); }
    record Challenge(UUID id,Instant expiresAt) {}
    record Outcome(Proof proof,Challenge challenge) {}

    record Request(UUID accountId, UUID sessionId, UUID installationId, String platform, String token) {
        @Override public String toString() { return "DeviceVerification.Request[redacted]"; }
    }
    record Proof(UUID accountId, UUID sessionId, UUID installationId, String platform,
                 String tokenSha256, String environment, String projectId, Instant verifiedAt,UUID verificationId) {
        public Proof(UUID accountId,UUID sessionId,UUID installationId,String platform,String tokenSha256,String environment,String projectId,Instant verifiedAt) {
            this(accountId,sessionId,installationId,platform,tokenSha256,environment,projectId,verifiedAt,null);
        }
        @Override public String toString() { return "DeviceVerification.Proof[redacted]"; }
    }
}
