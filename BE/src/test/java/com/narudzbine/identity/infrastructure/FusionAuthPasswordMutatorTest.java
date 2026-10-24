package com.narudzbine.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.narudzbine.identity.api.PasswordCredentialMutator.Outcome;
import com.narudzbine.identity.api.PasswordCredentialVerifier.Subject;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Flow;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class FusionAuthPasswordMutatorTest {
    private static final UUID TENANT=UUID.randomUUID(),USER=UUID.randomUUID(),OP=UUID.randomUUID();
    private static final Subject SUBJECT=new Subject(TENANT,USER);
    private static final String PASSWORD="  Password with 😀 spaces  ";
    @Test void patchUsesImmutableSubjectPurposeMarkerAndUnmodifiedPassword() {
        var adapter=adapter(request -> {
            assertThat(request.method()).isEqualTo("PATCH");
            assertThat(request.uri()).isEqualTo(URI.create("https://identity.example/api/user/"+USER));
            assertThat(request.timeout().orElseThrow()).isEqualTo(java.time.Duration.ofSeconds(5));
            assertThat(request.headers().firstValue("X-FusionAuth-TenantId")).contains(TENANT.toString());
            var body=new FusionAuthPasswordVerifier.BoundedBody();
            request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
                public void onSubscribe(Flow.Subscription value) { body.onSubscribe(value); }
                public void onNext(ByteBuffer value) { body.onNext(List.of(value)); }
                public void onError(Throwable value) { body.onError(value); }
                public void onComplete() { body.onComplete(); }
            });
            var json=JsonMapper.builder().build().readTree(body.getBody().toCompletableFuture().get());
            assertThat(json.path("user").path("password").asString()).isEqualTo(PASSWORD);
            assertThat(json.path("user").path("data").path("narudzbinePasswordOperation").asString()).isEqualTo(OP.toString());
            assertThat(json.path("user").propertyNames()).containsExactlyInAnyOrder("password","data");
            return reply(200,confirmed(TENANT,USER,OP));
        });
        assertThat(adapter.change(SUBJECT,OP,PASSWORD)).isEqualTo(Outcome.APPLIED);
    }
    @Test void uncertainResponsesNeverCauseAnotherWriteAndMissingMarkerNeverProvesFailure() {
        for(int status:new int[]{200,301,429,500,503}) {
            var calls=new AtomicInteger();
            var adapter=adapter(request->{ calls.incrementAndGet();return reply(status,"{}"); });
            assertThat(adapter.change(SUBJECT,OP,PASSWORD)).isEqualTo(Outcome.UNKNOWN);assertThat(calls).hasValue(1);
            assertThat(adapter.reconcile(SUBJECT,OP)).isEqualTo(Outcome.UNKNOWN);assertThat(calls).hasValue(2);
        }
        assertThat(adapter(request->{throw new java.io.IOException(PASSWORD);}).change(SUBJECT,OP,PASSWORD)).isEqualTo(Outcome.UNKNOWN);
        assertThat(adapter(request->reply(200,"x".repeat(65537))).change(SUBJECT,OP,PASSWORD)).isEqualTo(Outcome.UNKNOWN);
        assertThat(adapter(request->reply(200,confirmed(UUID.randomUUID(),USER,OP))).change(SUBJECT,OP,PASSWORD)).isEqualTo(Outcome.UNKNOWN);
        assertThat(adapter(request->reply(200,confirmed(TENANT,UUID.randomUUID(),OP))).change(SUBJECT,OP,PASSWORD)).isEqualTo(Outcome.UNKNOWN);
    }
    @Test void reconciliationIsGetOnlyAndRequiresMatchingTenantUserAndOperation() {
        var adapter=adapter(request->{ assertThat(request.method()).isEqualTo("GET");assertThat(request.bodyPublisher()).isEmpty();return reply(200,confirmed(TENANT,USER,OP)); });
        assertThat(adapter.reconcile(SUBJECT,OP)).isEqualTo(Outcome.APPLIED);
        assertThat(adapter.reconcile(SUBJECT,UUID.randomUUID())).isEqualTo(Outcome.UNKNOWN);
        assertThat(adapter.reconcile(new Subject(UUID.randomUUID(),USER),OP)).isEqualTo(Outcome.UNKNOWN);
    }
    @Test void classifiesDefinitePolicyAndAuthorizationRejectionsWithoutExposingProviderContent() {
        assertThat(adapter(request->reply(400,"{\"fieldErrors\":{\"user.password\":[{\"message\":\"secret\"}]}}"))
                .change(SUBJECT,OP,PASSWORD)).isEqualTo(Outcome.POLICY_REJECTED);
        for(int status:new int[]{400,401,403,404}) { assertThat(adapter(request->reply(status,"{}")).change(SUBJECT,OP,PASSWORD)).isEqualTo(Outcome.REJECTED); }
        var calls=new AtomicInteger();
        assertThat(adapter(request->{ calls.incrementAndGet();return reply(200,"{}"); }).change(new Subject(UUID.randomUUID(),USER),OP,PASSWORD)).isEqualTo(Outcome.REJECTED);
        assertThat(calls).hasValue(0);
        assertThatThrownBy(()->new FusionAuthPasswordMutator(URI.create("http://identity.example/api/login"),TENANT,"synthetic"))
                .isInstanceOf(IllegalArgumentException.class);
    }
    @Test void realProviderActivationRequiresExplicitRecordedConformance() {
        assertThatThrownBy(()->new FusionAuthConfiguration().passwordCredentialMutator(
                URI.create("https://identity.example/api/login"),TENANT,"synthetic-test-key",false))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("G-02");
    }
    private static FusionAuthPasswordMutator adapter(FusionAuthPasswordVerifier.Exchange exchange) {
        return new FusionAuthPasswordMutator(URI.create("https://identity.example/api/login"),TENANT,"synthetic-test-key",exchange);
    }
    private static FusionAuthPasswordVerifier.Reply reply(int status,String body) { return new FusionAuthPasswordVerifier.Reply(status,body.getBytes(StandardCharsets.UTF_8)); }
    private static String confirmed(UUID tenant,UUID user,UUID operation) {
        return JsonMapper.builder().build().writeValueAsString(Map.of("user",Map.of("id",user.toString(),"tenantId",tenant.toString(),"data",Map.of("narudzbinePasswordOperation",operation.toString()))));
    }
}
