package com.narudzbine.identity.infrastructure;

import java.time.Clock;
import java.util.Date;
import java.util.function.Supplier;
import java.security.interfaces.ECPrivateKey;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.*;

public final class AppleClientSecret implements Supplier<String> {
    private final String team,client,keyId;
    private final ECPrivateKey key;
    private final Clock clock;
    public AppleClientSecret(String team,String client,String keyId,ECPrivateKey key,Clock clock) {
        if(team==null || team.isBlank() || client==null || client.isBlank() || keyId==null || keyId.isBlank() || key==null || key.getParams().getCurve().getField().getFieldSize()!=256) { throw new IllegalArgumentException("Explicit Apple P-256 signing configuration required."); }
        this.team=team;this.client=client;this.keyId=keyId;this.key=key;this.clock=clock;
    }
    @Override public String get() {
        try {
            var now=clock.instant();var jwt=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(keyId).build(),
                    new JWTClaimsSet.Builder().issuer(team).subject(client).audience("https://appleid.apple.com").issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(300))).build());
            jwt.sign(new ECDSASigner(key));return jwt.serialize();
        } catch(Exception e) { throw new IllegalStateException("Apple client assertion unavailable."); }
    }
    @Override public String toString() { return "AppleClientSecret[redacted]"; }
}
