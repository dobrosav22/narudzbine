package com.narudzbine.identity.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.identity.api.ExternalIdentityProvider.*;
import com.narudzbine.identity.api.InvalidLogin;
import com.narudzbine.identity.application.ExternalSecrets;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jwt.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import tools.jackson.databind.json.JsonMapper;

class SpringOidcProviderTest {
    private final Instant now=Instant.parse("2026-10-18T12:00:00Z");
    private final Clock clock=Clock.fixed(now,ZoneOffset.UTC);
    private final KeyPair key=rsa();
    private final String verifier="a".repeat(43),nonce=ExternalSecrets.nonce(verifier);
    private final AtomicReference<String> token=new AtomicReference<>();
    private final List<java.net.http.HttpRequest> requests=new ArrayList<>();
    private final SpringOidcProvider provider=new SpringOidcProvider(Map.of(Provider.GOOGLE,client(),Provider.APPLE,client()),clock,request->{
        requests.add(request);
        return new FusionAuthPasswordVerifier.Reply(200,JsonMapper.builder().build().writeValueAsBytes(Map.of("access_token","discarded-provider-access-token","token_type","Bearer","expires_in",300,"id_token",token.get())));
    },registration->NimbusJwtDecoder.withPublicKey((RSAPublicKey)key.getPublic()).build());

    @Test void maintainedOidcValidationAcceptsSignedFreshProofAndRequiresNoncePkce() throws Exception {
        token.set(sign(claims(),key));
        assertThat(provider.verify(Provider.GOOGLE,Purpose.LOGIN,"state","code",verifier,nonce,now).subject()).isEqualTo("immutable-subject");
        assertThat(requests).hasSize(1);assertThat(requests.getFirst().uri()).isEqualTo(URI.create("https://id.example/token"));
        var body=new FusionAuthPasswordVerifier.BoundedBody();requests.getFirst().bodyPublisher().orElseThrow().subscribe(new java.util.concurrent.Flow.Subscriber<java.nio.ByteBuffer>() {
            public void onSubscribe(java.util.concurrent.Flow.Subscription s) {body.onSubscribe(s);}public void onNext(java.nio.ByteBuffer b) {body.onNext(List.of(b));}
            public void onError(Throwable t) {body.onError(t);}public void onComplete() {body.onComplete();}
        });
        String form=new String(body.getBody().toCompletableFuture().get(),StandardCharsets.UTF_8);
        assertThat(form).contains("code_verifier="+verifier,"client_secret=synthetic-client-secret","redirect_uri=https%3A%2F%2Fapi.example%2Fcallback");
        String authorization=provider.authorization(Provider.APPLE,Purpose.LINK,"state",verifier,nonce);
        assertThat(authorization).contains("scope=openid+email","response_mode=form_post","prompt=login","max_age=0","code_challenge_method=S256","nonce="+ExternalSecrets.challenge(nonce));
    }
    @Test void rejectsWrongIssuerAudienceAuthorizedPartyNonceAndStaleOrMissingFreshProof() throws Exception {
        for(var entry:Map.<String,Object>of("iss","https://other.example","aud",List.of("other-client"),"azp","other-client","nonce","wrong","auth_time",now.minusSeconds(1).getEpochSecond(),"exp",now.getEpochSecond(),"iat",now.plusSeconds(1).getEpochSecond(),"sub","").entrySet()) {
            var values=claims();values.put(entry.getKey(),entry.getValue());token.set(sign(values,key));
            assertThatThrownBy(()->provider.verify(Provider.GOOGLE,Purpose.LOGIN,"state","code",verifier,nonce,now)).as(entry.getKey()).isInstanceOf(InvalidLogin.class).hasNoCause();
        }
        var missing=claims();missing.remove("auth_time");token.set(sign(missing,key));
        assertThatThrownBy(()->provider.verify(Provider.GOOGLE,Purpose.LOGIN,"state","code",verifier,nonce,now)).isInstanceOf(InvalidLogin.class);
        var ambiguous=claims();ambiguous.put("aud",List.of("client","other"));ambiguous.remove("azp");token.set(sign(ambiguous,key));
        assertThatThrownBy(()->provider.verify(Provider.GOOGLE,Purpose.LOGIN,"state","code",verifier,nonce,now)).isInstanceOf(InvalidLogin.class);
    }
    @Test void rejectsWrongSignatureAndUnsignedToken() throws Exception {
        token.set(sign(claims(),rsa()));assertThatThrownBy(()->provider.verify(Provider.GOOGLE,Purpose.LOGIN,"state","code",verifier,nonce,now)).isInstanceOf(InvalidLogin.class);
        token.set(new PlainJWT(JWTClaimsSet.parse(claims())).serialize());assertThatThrownBy(()->provider.verify(Provider.GOOGLE,Purpose.LOGIN,"state","code",verifier,nonce,now)).isInstanceOf(InvalidLogin.class);
    }
    @Test void boundsProviderFailuresWithoutRetryOrLeakingResponse() {
        var failing=new SpringOidcProvider(Map.of(Provider.GOOGLE,client()),clock,request->{requests.add(request);return new FusionAuthPasswordVerifier.Reply(503,"sensitive provider body".getBytes(StandardCharsets.UTF_8));},r->NimbusJwtDecoder.withPublicKey((RSAPublicKey)key.getPublic()).build());
        assertThatThrownBy(()->failing.verify(Provider.GOOGLE,Purpose.LOGIN,"state","code",verifier,nonce,now)).isInstanceOf(RuntimeException.class).hasNoCause().hasMessageNotContaining("sensitive");assertThat(requests).hasSize(1);
    }
    @Test void appleClientAssertionIsShortLivedSignedAndRedacted() throws Exception {
        var generator=KeyPairGenerator.getInstance("EC");generator.initialize(new java.security.spec.ECGenParameterSpec("secp256r1"));var pair=generator.generateKeyPair();
        var supplier=new AppleClientSecret("team","client","key-id",(ECPrivateKey)pair.getPrivate(),clock);var jwt=SignedJWT.parse(supplier.get());
        assertThat(jwt.verify(new ECDSAVerifier((ECPublicKey)pair.getPublic()))).isTrue();assertThat(jwt.getHeader().getKeyID()).isEqualTo("key-id");
        var c=jwt.getJWTClaimsSet();assertThat(c.getIssuer()).isEqualTo("team");assertThat(c.getSubject()).isEqualTo("client");assertThat(c.getAudience()).containsExactly("https://appleid.apple.com");
        assertThat(c.getIssueTime().toInstant()).isEqualTo(now);assertThat(c.getExpirationTime().toInstant()).isEqualTo(now.plusSeconds(300));assertThat(supplier.toString()).isEqualTo("AppleClientSecret[redacted]");
    }
    @Test void realProviderActivationRequiresRecordedConformance() {
        new org.springframework.boot.test.context.runner.ApplicationContextRunner().withUserConfiguration(ExternalProviderConfiguration.class)
                .withBean(Clock.class,()->clock).withPropertyValues("identity.external.provider.enabled=true",
                        "identity.external.google.client-id=synthetic", "identity.external.google.secret=synthetic", "identity.external.google.callback=https://api.example/api/v1/auth/external/GOOGLE/callback",
                        "identity.external.apple.client-id=synthetic", "identity.external.apple.team-id=synthetic", "identity.external.apple.key-id=synthetic", "identity.external.apple.private-key=synthetic",
                        "identity.external.apple.callback=https://api.example/api/v1/auth/external/APPLE/callback")
                .run(context->assertThat(context.getStartupFailure()).hasRootCauseMessage("Recorded G-02 external PKCE/fresh-proof conformance is required before activation."));
    }
    private Map<String,Object> claims() {return new HashMap<>(Map.of("iss","https://id.example","sub","immutable-subject","aud",List.of("client"),"azp","client","iat",now.getEpochSecond(),"exp",now.plusSeconds(300).getEpochSecond(),"auth_time",now.getEpochSecond(),"nonce",ExternalSecrets.challenge(nonce)));}
    private String sign(Map<String,Object> claims,KeyPair signing) throws Exception {var jwt=new SignedJWT(new JWSHeader(JWSAlgorithm.RS256),JWTClaimsSet.parse(claims));jwt.sign(new RSASSASigner((RSAPrivateKey)signing.getPrivate()));return jwt.serialize();}
    private static KeyPair rsa() {try {var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);return generator.generateKeyPair();}catch(Exception e){throw new AssertionError(e);}}
    private static SpringOidcProvider.Client client() {return new SpringOidcProvider.Client("https://id.example",URI.create("https://id.example/authorize"),URI.create("https://id.example/token"),URI.create("https://id.example/keys"),URI.create("https://api.example/callback"),"client",()->"synthetic-client-secret");}
}
