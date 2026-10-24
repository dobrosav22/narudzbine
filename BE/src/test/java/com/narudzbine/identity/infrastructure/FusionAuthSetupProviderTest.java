package com.narudzbine.identity.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.identity.api.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class FusionAuthSetupProviderTest {
    private final UUID tenant=UUID.randomUUID(),application=UUID.randomUUID(),user=UUID.randomUUID(),operation=UUID.randomUUID();
    private final String email="synthetic@example.com",password="  Unmodified synthetic password  ";
    private final PasswordCredentialVerifier.Subject subject=new PasswordCredentialVerifier.Subject(tenant,user);
    @Test void singleCombinedCreateUsesPinnedSubjectMarkerAndNoMailOrPasswordPersistence() throws Exception {
        var provider=provider(request->{assertThat(request.uri().getPath()).isEqualTo("/api/user/registration/"+user);assertThat(request.method()).isEqualTo("POST");
            var body=new FusionAuthPasswordVerifier.BoundedBody();request.bodyPublisher().orElseThrow().subscribe(new java.util.concurrent.Flow.Subscriber<java.nio.ByteBuffer>(){
                public void onSubscribe(java.util.concurrent.Flow.Subscription s){body.onSubscribe(s);}public void onNext(java.nio.ByteBuffer b){body.onNext(List.of(b));}public void onError(Throwable t){body.onError(t);}public void onComplete(){body.onComplete();}});
            var json=JsonMapper.builder().build().readTree(body.getBody().toCompletableFuture().get());assertThat(json.path("user").path("password").asString()).isEqualTo(password);assertThat(json.path("user").path("data").path("narudzbineSetupOperation").asString()).isEqualTo(operation.toString());assertThat(json.path("skipVerification").asBoolean()).isTrue();assertThat(json.path("sendSetPasswordIdentityType").asString()).isEqualTo("doNotSend");return reply(200,success());});
        assertThat(provider.create(subject,operation,email,password)).isEqualTo(SetupCredentialProvider.Outcome.APPLIED);
    }
    @Test void rejectsWrongSubjectTenantEmailMarkerRegistrationAndProviderTokens(){
        for(String body:List.of(success().replace(user.toString(),UUID.randomUUID().toString()),success().replace(tenant.toString(),UUID.randomUUID().toString()),success().replace(email,"other@example.com"),success().replace(operation.toString(),UUID.randomUUID().toString()),success().replace(application.toString(),UUID.randomUUID().toString()),success().replace("\"active\":true","\"active\":false"),success().replace("\"verified\":true","\"verified\":false"),("{\"token\":\"unexpected\","+success().substring(1)),"x".repeat(65537))){assertThat(provider(r->reply(200,body)).create(subject,operation,email,password)).isEqualTo(SetupCredentialProvider.Outcome.UNKNOWN);}
    }
    @Test void onlyExplicitPolicyDenialReleasesAttemptAndUnknownNeverRetries(){
        assertThat(provider(r->reply(400,"{\"fieldErrors\":{\"user.password\":[{}]}}" )).create(subject,operation,email,password)).isEqualTo(SetupCredentialProvider.Outcome.POLICY_REJECTED);
        for(int status:new int[]{301,400,401,403,404,409,429,500}){var calls=new AtomicInteger();var provider=provider(r->{calls.incrementAndGet();return reply(status,"sensitive provider error");});assertThat(provider.create(subject,operation,email,password)).isEqualTo(SetupCredentialProvider.Outcome.UNKNOWN);assertThat(calls).hasValue(1);}
    }
    @Test void reconciliationIsReadOnlyAndAbsenceDoesNotProveSafeRedispatch(){
        var provider=provider(r->{assertThat(r.method()).isEqualTo("GET");assertThat(r.uri().getPath()).isEqualTo("/api/user/"+user);return reply(200,success());});assertThat(provider.reconcile(subject,operation,email)).isEqualTo(SetupCredentialProvider.Outcome.APPLIED);
        assertThat(provider(r->reply(404,"{}")).reconcile(subject,operation,email)).isEqualTo(SetupCredentialProvider.Outcome.UNKNOWN);
    }
    private FusionAuthSetupProvider provider(FusionAuthPasswordVerifier.Exchange exchange){return new FusionAuthSetupProvider(URI.create("https://identity.example/api/login"),tenant,application,"synthetic-api-key",exchange);}
    private FusionAuthPasswordVerifier.Reply reply(int status,String body){return new FusionAuthPasswordVerifier.Reply(status,body.getBytes(StandardCharsets.UTF_8));}
    private String success(){return JsonMapper.builder().build().writeValueAsString(Map.of("user",Map.of("id",user,"tenantId",tenant,"email",email,"active",true,"verified",true,"data",Map.of("narudzbineSetupOperation",operation)),"registration",Map.of("applicationId",application,"verified",true)));}
}
