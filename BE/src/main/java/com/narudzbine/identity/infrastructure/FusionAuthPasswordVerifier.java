package com.narudzbine.identity.infrastructure;

import com.narudzbine.identity.api.CredentialProviderUnavailable;
import com.narudzbine.identity.api.PasswordCredentialVerifier;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.JsonNode;

/** Explicitly configured adapter; never registered as a default/fake provider. */
public final class FusionAuthPasswordVerifier implements PasswordCredentialVerifier {
    private static final int MAX_RESPONSE_BYTES = 65536;
    private final URI endpoint;
    private final UUID tenant;
    private final UUID application;
    private final String apiKey;
    private final Exchange exchange;
    private final JsonMapper json = JsonMapper.builder().build();

    public FusionAuthPasswordVerifier(URI endpoint, UUID tenant, UUID application, String apiKey) {
        this(endpoint, tenant, application, apiKey, new HttpExchange());
    }

    FusionAuthPasswordVerifier(URI endpoint, UUID tenant, UUID application, String apiKey, Exchange exchange) {
        if (endpoint == null || !"https".equals(endpoint.getScheme()) || endpoint.getHost() == null
                || endpoint.getUserInfo() != null || endpoint.getQuery() != null || endpoint.getFragment() != null
                || !"/api/login".equals(endpoint.getPath()) || tenant == null || application == null
                || apiKey == null || apiKey.isBlank() || apiKey.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("Explicit HTTPS provider endpoint, tenant, application and key are required.");
        }
        this.endpoint = endpoint;
        this.tenant = tenant;
        this.application = application;
        this.apiKey = apiKey;
        this.exchange = exchange;
    }

    @Override
    public Optional<Subject> verify(String normalizedEmail, String password) {
        try {
            byte[] body = json.writeValueAsBytes(Map.of("applicationId", application.toString(),
                    "loginId", normalizedEmail, "loginIdTypes", List.of("email"), "password", password, "noJWT", true));
            var request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(5))
                    .header("Authorization", apiKey).header("X-FusionAuth-TenantId", tenant.toString())
                    .header("Content-Type", "application/json").header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
            Reply reply = exchange.send(request);
            if (reply.body().length > MAX_RESPONSE_BYTES) {
                throw new CredentialProviderUnavailable();
            }
            switch (reply.status()) {
                case 202, 203, 212, 213, 404, 409, 410, 423: return Optional.empty();
                case 200: break;
                default: throw new CredentialProviderUnavailable();
            }
            var response = json.readTree(reply.body());
            var user = response.path("user");
            if (!user.isObject() || !user.path("active").isBoolean() || !user.path("registrations").isArray()) {
                throw new CredentialProviderUnavailable();
            }
            if (!user.path("active").asBoolean(false) || !verifiedEmail(user, normalizedEmail)
                    || user.path("passwordChangeRequired").asBoolean(false)) {
                return Optional.empty();
            }
            if (!tenant.toString().equals(user.path("tenantId").asString())
                    || response.has("token") || response.has("refreshToken")) {
                throw new CredentialProviderUnavailable();
            }
            boolean registered = false;
            for (var registration : user.path("registrations")) {
                if (application.toString().equals(registration.path("applicationId").asString())) {
                    registered = true;
                }
            }
            if (!registered) {
                return Optional.empty();
            }
            String id = user.path("id").asString();
            UUID userId = UUID.fromString(id);
            if (!userId.toString().equals(id)) {
                throw new CredentialProviderUnavailable();
            }
            return Optional.of(new Subject(tenant, userId));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new CredentialProviderUnavailable();
        } catch (Exception exception) {
            // Never retain a provider body, password, API key or transport exception as a public cause.
            throw new CredentialProviderUnavailable();
        }
    }

    private static boolean verifiedEmail(JsonNode user, String email) {
        if (user.has("identities")) {
            if (!user.path("identities").isArray()) { throw new CredentialProviderUnavailable(); }
            for (var identity : user.path("identities")) {
                if ("email".equals(identity.path("type").asString())
                        && identity.path("primary").isBoolean() && identity.path("primary").asBoolean()
                        && identity.path("verified").isBoolean() && identity.path("verified").asBoolean()
                        && email.equals(identity.path("value").asString("").toLowerCase(Locale.ROOT))) {
                    return true;
                }
            }
            return false;
        }
        // Compatibility with the documented pre-1.59 primary-email representation only.
        return user.path("verified").isBoolean() && user.path("verified").asBoolean()
                && email.equals(user.path("email").asString("").toLowerCase(Locale.ROOT));
    }

    @FunctionalInterface
    interface Exchange { Reply send(HttpRequest request) throws Exception; }
    record Reply(int status, byte[] body) {
        @Override public String toString() { return "ProviderReply[redacted]"; }
    }

    static final class HttpExchange implements Exchange {
        private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
                .followRedirects(HttpClient.Redirect.NEVER).build();

        @Override
        public Reply send(HttpRequest request) throws Exception {
            var future = client.sendAsync(request, info -> new BoundedBody());
            try {
                var response = future.get(5, TimeUnit.SECONDS);
                return new Reply(response.statusCode(), response.body());
            } finally {
                if (!future.isDone()) {
                    future.cancel(true);
                }
            }
        }
    }

    static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private Flow.Subscription subscription;

        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription incoming) {
            if (subscription != null) { incoming.cancel(); return; }
            subscription = incoming;
            subscription.request(1);
        }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (ByteBuffer buffer : buffers) {
                if (buffer.remaining() > MAX_RESPONSE_BYTES - bytes.size()) {
                    subscription.cancel();
                    result.completeExceptionally(new CredentialProviderUnavailable());
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable error) {
            result.completeExceptionally(new CredentialProviderUnavailable());
        }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
