package com.narudzbine.identity.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.narudzbine.identity.api.EmailCredentialMutator.Outcome;
import com.narudzbine.identity.api.PasswordCredentialVerifier.Subject;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class FusionAuthEmailMutatorTest {
    private static final UUID TENANT=UUID.randomUUID(),USER=UUID.randomUUID(),OP=UUID.randomUUID();
    private static final Subject SUBJECT=new Subject(TENANT,USER);
    private static final String OLD="old@example.com",NEXT="new@example.com";
    @Test void appliesOnceVerifiesAndReadsBackExpectedImmutableIdentityAndMarker() {
        var calls=new AtomicInteger();var adapter=adapter(request -> {
            int step=calls.incrementAndGet();assertThat(request.timeout().orElseThrow()).isEqualTo(java.time.Duration.ofSeconds(5));
            assertThat(request.headers().firstValue("X-FusionAuth-TenantId")).contains(TENANT.toString());
            assertThat(request.uri().getPath()).isEqualTo(step==2?"/api/user/verify-email":"/api/user/"+USER);
            assertThat(request.method()).isEqualTo(step==1?"PATCH":step==2?"POST":"GET");
            if(step<3) {
                var content=new FusionAuthPasswordVerifier.BoundedBody();
                request.bodyPublisher().orElseThrow().subscribe(new java.util.concurrent.Flow.Subscriber<java.nio.ByteBuffer>() {
                    public void onSubscribe(java.util.concurrent.Flow.Subscription value) { content.onSubscribe(value); }
                    public void onNext(java.nio.ByteBuffer value) { content.onNext(java.util.List.of(value)); }
                    public void onError(Throwable value) { content.onError(value); }
                    public void onComplete() { content.onComplete(); }
                });
                var payload=JsonMapper.builder().build().readTree(content.getBody().toCompletableFuture().get());
                if(step==1) {
                    assertThat(payload.propertyNames()).containsExactly("user");
                    assertThat(payload.path("user").propertyNames()).containsExactlyInAnyOrder("email","data");
                    assertThat(payload.path("user").path("email").asString()).isEqualTo(NEXT);
                    assertThat(payload.path("user").path("data").path("narudzbineEmailOperation").asString()).isEqualTo(OP.toString());
                } else { assertThat(payload.path("userId").asString()).isEqualTo(USER.toString()); }
            }
            return reply(200,step==2?"{}":body(TENANT,USER,OP,NEXT,step==3));
        });
        assertThat(adapter.change(SUBJECT,OP,OLD,NEXT)).isEqualTo(Outcome.APPLIED);assertThat(calls).hasValue(3);
    }
    @Test void failedAdministrativeVerificationIsUncertainAndNeverReissuesPatch() {
        var calls=new AtomicInteger();var adapter=adapter(request -> {
            int step=calls.incrementAndGet();if(step==1) { return reply(200,body(TENANT,USER,OP,NEXT,false)); }
            if(step==2) { throw new java.io.IOException("synthetic transport failure"); }
            assertThat(request.method()).isEqualTo("GET");return reply(200,body(TENANT,USER,OP,NEXT,false));
        });
        assertThat(adapter.change(SUBJECT,OP,OLD,NEXT)).isEqualTo(Outcome.UNKNOWN);assertThat(calls).hasValue(2);
        assertThat(adapter.reconcile(SUBJECT,OP,OLD,NEXT)).isEqualTo(Outcome.UNKNOWN);assertThat(calls).hasValue(3);
    }
    @Test void definitePrePatchRejectionAndTransportAmbiguityAreSeparated() {
        for(int status:new int[]{400,401,403,404}) {
            var calls=new AtomicInteger();var adapter=adapter(request->{calls.incrementAndGet();return reply(status,"{}");});
            assertThat(adapter.change(SUBJECT,OP,OLD,NEXT)).isEqualTo(Outcome.REJECTED);assertThat(calls).hasValue(1);
        }
        for(int status:new int[]{200,301,429,500,503}) {
            var calls=new AtomicInteger();assertThat(adapter(request->{calls.incrementAndGet();return reply(status,"{}");}).change(SUBJECT,OP,OLD,NEXT)).isEqualTo(Outcome.UNKNOWN);
            assertThat(calls).hasValue(1);
        }
    }
    @Test void readOnlyReconciliationRequiresVerifiedTargetMatchingMarkerSubjectAndNoOldAlias() {
        for(String content:new String[]{body(UUID.randomUUID(),USER,OP,NEXT,true),body(TENANT,UUID.randomUUID(),OP,NEXT,true),
                body(TENANT,USER,UUID.randomUUID(),NEXT,true),body(TENANT,USER,OP,OLD,true),body(TENANT,USER,OP,NEXT,false),"x".repeat(65537),
                body(TENANT,USER,OP,NEXT,true).replace("\"verified\":true","\"verified\":true,\"identities\":[{\"type\":\"email\",\"primary\":true,\"verified\":true,\"value\":\"new@example.com\"},{\"type\":\"email\",\"value\":\"old@example.com\"}]")}) {
            assertThat(adapter(request->{assertThat(request.method()).isEqualTo("GET");return reply(200,content);}).reconcile(SUBJECT,OP,OLD,NEXT)).isEqualTo(Outcome.UNKNOWN);
        }
        assertThat(adapter(request->reply(200,body(TENANT,USER,OP,NEXT,true))).reconcile(SUBJECT,OP,OLD,NEXT)).isEqualTo(Outcome.APPLIED);
    }
    @Test void realActivationFailsWithoutConformanceAndRejectsUnsafeEndpoint() {
        assertThatThrownBy(()->new FusionAuthConfiguration().emailCredentialMutator(URI.create("https://identity.example/api/login"),TENANT,"synthetic",false)).isInstanceOf(IllegalStateException.class).hasMessageContaining("G-02");
        assertThatThrownBy(()->new FusionAuthEmailMutator(URI.create("http://identity.example/api/login"),TENANT,"synthetic")).isInstanceOf(IllegalArgumentException.class);
        var calls=new AtomicInteger();assertThat(adapter(request->{calls.incrementAndGet();return reply(200,"{}");}).change(new Subject(UUID.randomUUID(),USER),OP,OLD,NEXT)).isEqualTo(Outcome.REJECTED);assertThat(calls).hasValue(0);
    }
    private static FusionAuthEmailMutator adapter(FusionAuthPasswordVerifier.Exchange exchange) { return new FusionAuthEmailMutator(URI.create("https://identity.example/api/login"),TENANT,"synthetic-test-key",exchange); }
    private static FusionAuthPasswordVerifier.Reply reply(int status,String body) { return new FusionAuthPasswordVerifier.Reply(status,body.getBytes(StandardCharsets.UTF_8)); }
    private static String body(UUID tenant,UUID user,UUID operation,String email,boolean verified) {
        return JsonMapper.builder().build().writeValueAsString(Map.of("user",Map.of("id",user.toString(),"tenantId",tenant.toString(),"email",email,"verified",verified,"data",Map.of("narudzbineEmailOperation",operation.toString()))));
    }
}
