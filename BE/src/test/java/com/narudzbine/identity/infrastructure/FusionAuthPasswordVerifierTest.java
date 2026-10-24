package com.narudzbine.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.narudzbine.identity.api.CredentialProviderUnavailable;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Flow;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class FusionAuthPasswordVerifierTest {
    private static final UUID TENANT = UUID.randomUUID();
    private static final UUID APP = UUID.randomUUID();
    private static final UUID USER = UUID.randomUUID();
    private static final String PASSWORD = "  Unmodified password ";

    @Test
    void sendsEmailOnlyTenantBoundVerificationWithoutTokensAndPreservesPassword() throws Exception {
        var verifier = verifier(request -> {
            assertThat(request.uri()).isEqualTo(URI.create("https://identity.example/api/login"));
            assertThat(request.headers().firstValue("X-FusionAuth-TenantId")).contains(TENANT.toString());
            assertThat(request.headers().firstValue("Authorization")).contains("synthetic-test-key");
            var body = new FusionAuthPasswordVerifier.BoundedBody();
            request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
                public void onSubscribe(Flow.Subscription value) { body.onSubscribe(value); }
                public void onNext(ByteBuffer value) { body.onNext(List.of(value)); }
                public void onError(Throwable value) { body.onError(value); }
                public void onComplete() { body.onComplete(); }
            });
            var json = JsonMapper.builder().build().readTree(body.getBody().toCompletableFuture().get());
            assertThat(json.path("password").asString()).isEqualTo(PASSWORD);
            assertThat(json.path("noJWT").asBoolean()).isTrue();
            assertThat(json.path("loginIdTypes").toString()).isEqualTo("[\"email\"]");
            assertThat(json.path("applicationId").asString()).isEqualTo(APP.toString());
            return reply(200, success());
        });
        assertThat(verifier.verify("person@example.com", PASSWORD).orElseThrow().userId()).isEqualTo(USER);
    }

    @Test
    void separatesUserDenialFromProviderFailureAndNeverRetries() {
        for (int status : new int[] {202, 203, 212, 213, 404, 409, 410, 423}) {
            assertThat(verifier(request -> reply(status, "ignored")).verify("person@example.com", PASSWORD)).isEmpty();
        }
        for (int status : new int[] {301, 400, 401, 403, 429, 500, 503, 242}) {
            AtomicInteger calls = new AtomicInteger();
            var verifier = verifier(request -> { calls.incrementAndGet(); return reply(status, PASSWORD); });
            assertThatThrownBy(() -> verifier.verify("person@example.com", PASSWORD))
                    .isInstanceOf(CredentialProviderUnavailable.class).hasNoCause().hasMessageNotContaining(PASSWORD);
            assertThat(calls).hasValue(1);
        }
    }

    @Test
    void rejectsIncompleteUnverifiedCrossTenantAndTokenBearingSuccess() {
        for (String body : List.of(success().replace("\"active\":true", "\"active\":false"),
                success().replace("\"verified\":true", "\"verified\":false"),
                success().replace("\"active\":true", "\"active\":true,\"passwordChangeRequired\":true"),
                success().replace(APP.toString(), UUID.randomUUID().toString()))) {
            assertThat(verifier(request -> reply(200, body)).verify("person@example.com", PASSWORD)).isEmpty();
        }
        for (String body : List.of("not-json", "{}", success().replace(TENANT.toString(), UUID.randomUUID().toString()),
                success().replace("{\"user\"", "{\"token\":\"unexpected\",\"user\""),
                success().replace(USER.toString(), "invalid"), "x".repeat(65537))) {
            assertThatThrownBy(() -> verifier(request -> reply(200, body)).verify("person@example.com", PASSWORD))
                    .isInstanceOf(CredentialProviderUnavailable.class).hasNoCause();
        }
    }

    @Test
    void modernEmailIdentityMustMatchAndLegacyFlagCannotOverrideIt() {
        String identity = "\"identities\":[{\"type\":\"email\",\"primary\":true,\"verified\":true,\"value\":\"person@example.com\"}],";
        String modern = success().replace("\"verified\":true,\"registrations\"", identity + "\"registrations\"");
        assertThat(verifier(request -> reply(200, modern)).verify("person@example.com", PASSWORD)).isPresent();
        String unverified = modern.replace("\"verified\":true", "\"verified\":false")
                .replace("\"active\":true", "\"active\":true,\"verified\":true");
        assertThat(verifier(request -> reply(200, unverified)).verify("person@example.com", PASSWORD)).isEmpty();
        String wrong = modern.replace("\"value\":\"person@example.com\"", "\"value\":\"other@example.com\"");
        assertThat(verifier(request -> reply(200, wrong)).verify("person@example.com", PASSWORD)).isEmpty();
    }

    @Test
    void cancelsOversizedBodiesAndSanitizesTransportFailures() {
        var body = new FusionAuthPasswordVerifier.BoundedBody();
        AtomicInteger cancelled = new AtomicInteger();
        body.onSubscribe(new Flow.Subscription() {
            public void request(long count) { }
            public void cancel() { cancelled.incrementAndGet(); }
        });
        body.onNext(List.of(ByteBuffer.wrap(new byte[65536]), ByteBuffer.wrap(new byte[1])));
        assertThat(cancelled).hasValue(1);
        assertThat(body.getBody().toCompletableFuture()).isCompletedExceptionally();
        assertThatThrownBy(() -> verifier(request -> { throw new java.io.IOException(PASSWORD); })
                .verify("person@example.com", PASSWORD)).isInstanceOf(CredentialProviderUnavailable.class).hasNoCause();
        assertThatThrownBy(() -> new FusionAuthPasswordVerifier(URI.create("http://identity.example/api/login"),
                TENANT, APP, "synthetic-test-key")).isInstanceOf(IllegalArgumentException.class);
    }

    private FusionAuthPasswordVerifier verifier(FusionAuthPasswordVerifier.Exchange exchange) {
        return new FusionAuthPasswordVerifier(URI.create("https://identity.example/api/login"), TENANT, APP,
                "synthetic-test-key", exchange);
    }
    private static FusionAuthPasswordVerifier.Reply reply(int status, String body) {
        return new FusionAuthPasswordVerifier.Reply(status, body.getBytes(StandardCharsets.UTF_8));
    }
    private static String success() {
        return "{\"user\":{\"id\":\"" + USER + "\",\"tenantId\":\"" + TENANT
                + "\",\"active\":true,\"email\":\"person@example.com\",\"verified\":true,\"registrations\":[{\"applicationId\":\"" + APP + "\"}]}}";
    }
}
