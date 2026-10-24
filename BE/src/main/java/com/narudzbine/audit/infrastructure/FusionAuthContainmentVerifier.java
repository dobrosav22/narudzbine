package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.IndependentEvidence;
import com.narudzbine.audit.api.ManagedIdentityContainment;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.Flow;
import tools.jackson.databind.json.JsonMapper;

/** Isolated GET-only privacy observation. G-02 and real custody/operator evidence remain external. */
public final class FusionAuthContainmentVerifier implements ManagedIdentityContainment {
    static final int MAX_RESPONSE_BYTES = 65536;
    private final URI endpoint;
    private final UUID tenant;
    private final String key, conformance;
    private final boolean allowAbsence;
    private final Clock clock;
    private final Exchange exchange;
    private static final JsonMapper JSON = JsonMapper.builder()
            .enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();

    public FusionAuthContainmentVerifier(URI endpoint, UUID tenant, String key, String conformance,
            boolean allowAbsence, Clock clock) {
        this(endpoint,tenant,key,conformance,allowAbsence,clock,new HttpExchange());
    }
    FusionAuthContainmentVerifier(URI endpoint, UUID tenant, String key, String conformance,
            boolean allowAbsence, Clock clock, Exchange exchange) {
        if(endpoint==null || !"https".equals(endpoint.getScheme()) || endpoint.getHost()==null
                || endpoint.getUserInfo()!=null || !"/api/login".equals(endpoint.getPath())
                || endpoint.getQuery()!=null || endpoint.getFragment()!=null || tenant==null
                || key==null || key.isBlank() || key.chars().anyMatch(Character::isISOControl)
                || conformance==null || !conformance.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}")) {
            throw new IllegalArgumentException("Explicit isolated managed-identity observation configuration required");
        }
        this.endpoint=endpoint;this.tenant=tenant;this.key=key;this.conformance=conformance;
        this.allowAbsence=allowAbsence;this.clock=Objects.requireNonNull(clock);this.exchange=Objects.requireNonNull(exchange);
    }
    @Override public Optional<Observation> verify(Subject subject) {
        IndependentEvidence.outside();
        if(subject==null || subject.userId()==null || !tenant.equals(subject.tenantId())
                || !endpoint.toASCIIString().equals(subject.endpoint()) || !conformance.equals(subject.conformanceReference()) || allowAbsence!=subject.allowAbsence()) return Optional.empty();
        try {
            Reply reply=exchange.send(request("/api/user/"+subject.userId()));
            if(reply.body().length>MAX_RESPONSE_BYTES) return Optional.empty();
            if(reply.status()==200) {
                var user=JSON.readTree(reply.body()).path("user");
                if(!subject.userId().toString().equals(user.path("id").asString(""))
                        || !tenant.toString().equals(user.path("tenantId").asString(""))
                        || !user.path("active").isBoolean() || user.path("active").asBoolean()) return Optional.empty();
                return observed(subject,State.INACTIVE);
            }
            if(reply.status()==404 && allowAbsence) {
                Reply namespace=exchange.send(request("/api/tenant/"+tenant));
                if(namespace.status()!=200 || namespace.body().length>MAX_RESPONSE_BYTES) return Optional.empty();
                var value=JSON.readTree(namespace.body()).path("tenant");
                if(tenant.toString().equals(value.path("id").asString("")) && "Active".equals(value.path("state").asString(""))) {
                    return observed(subject,State.ABSENT_IN_CONFIRMED_TENANT);
                }
            }
            return Optional.empty();
        } catch(InterruptedException interrupted) {
            Thread.currentThread().interrupt();return Optional.empty();
        } catch(Exception unavailable) {
            return Optional.empty();
        }
    }
    private Optional<Observation> observed(Subject subject,State state) {
        return Optional.of(new Observation(subject,state,clock.instant().truncatedTo(ChronoUnit.MILLIS)));
    }
    private HttpRequest request(String path) {
        return HttpRequest.newBuilder(endpoint.resolve(path)).timeout(Duration.ofSeconds(5))
                .header("Authorization",key).header("X-FusionAuth-TenantId",tenant.toString())
                .header("Accept","application/json").GET().build();
    }
    @Override public String toString() { return "FusionAuthContainmentVerifier[redacted]"; }
    @FunctionalInterface interface Exchange { Reply send(HttpRequest request) throws Exception; }
    record Reply(int status,byte[] body) {
        Reply { body=body.clone(); }
        @Override public byte[] body() { return body.clone(); }
        @Override public String toString() { return "ContainmentReply[redacted]"; }
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
            if(result.isDone()) return;
            for (ByteBuffer buffer : buffers) {
                if (buffer.remaining() > MAX_RESPONSE_BYTES - bytes.size()) {
                    subscription.cancel();
                    result.completeExceptionally(new IllegalStateException("Managed observation unavailable"));
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable error) {
            result.completeExceptionally(new IllegalStateException("Managed observation unavailable"));
        }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
