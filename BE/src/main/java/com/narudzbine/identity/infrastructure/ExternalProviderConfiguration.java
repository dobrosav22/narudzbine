package com.narudzbine.identity.infrastructure;

import com.narudzbine.identity.api.ExternalIdentityProvider;
import com.narudzbine.identity.api.ExternalIdentityProvider.Provider;
import java.net.URI;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.util.Base64;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="identity.external.provider.enabled",havingValue="true")
public class ExternalProviderConfiguration {
    @Bean ExternalIdentityProvider externalIdentityProvider(Clock clock,
            @Value("${identity.external.provider.conformance:false}") boolean conformant,
            @Value("${identity.external.google.client-id}") String googleClient,
            @Value("${identity.external.google.secret}") String googleSecret,
            @Value("${identity.external.google.callback}") URI googleCallback,
            @Value("${identity.external.apple.client-id}") String appleClient,
            @Value("${identity.external.apple.team-id}") String appleTeam,
            @Value("${identity.external.apple.key-id}") String appleKeyId,
            @Value("${identity.external.apple.private-key}") String appleKey,
            @Value("${identity.external.apple.callback}") URI appleCallback) {
        if(!conformant) { throw new IllegalStateException("Recorded G-02 external PKCE/fresh-proof conformance is required before activation."); }
        ECPrivateKey signingKey;
        try { signingKey=(ECPrivateKey)KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(appleKey))); }
        catch(Exception e) { throw new IllegalArgumentException("Explicit Apple PKCS8 P-256 signing key required."); }
        if(googleSecret.isBlank() || !googleCallback.getPath().equals("/api/v1/auth/external/GOOGLE/callback")
                || !appleCallback.getPath().equals("/api/v1/auth/external/APPLE/callback")) { throw new IllegalArgumentException("Exact configured provider callbacks and credentials required."); }
        return new SpringOidcProvider(Map.of(
                Provider.GOOGLE,new SpringOidcProvider.Client("https://accounts.google.com",URI.create("https://accounts.google.com/o/oauth2/v2/auth"),
                        URI.create("https://oauth2.googleapis.com/token"),URI.create("https://www.googleapis.com/oauth2/v3/certs"),googleCallback,googleClient,()->googleSecret),
                Provider.APPLE,new SpringOidcProvider.Client("https://appleid.apple.com",URI.create("https://appleid.apple.com/auth/authorize"),
                        URI.create("https://appleid.apple.com/auth/token"),URI.create("https://appleid.apple.com/auth/keys"),appleCallback,appleClient,
                        new AppleClientSecret(appleTeam,appleClient,appleKeyId,signingKey,clock))),clock);
    }
}
