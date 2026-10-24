package com.narudzbine.audit.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.audit.api.ManagedIdentityContainment;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.Flow;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class FusionAuthContainmentVerifierTest {
    private static final URI ENDPOINT=URI.create("https://identity.example/api/login");
    private static final UUID TENANT=UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID USER=UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final Clock CLOCK=Clock.fixed(Instant.parse("2026-10-22T12:00:00.123456Z"),ZoneOffset.UTC);
    private final List<HttpRequest> requests=new ArrayList<>();
    private final Deque<FusionAuthContainmentVerifier.Reply> replies=new ArrayDeque<>();
    private ManagedIdentityContainment.Subject subject(boolean absent){return new ManagedIdentityContainment.Subject(TENANT,USER,ENDPOINT.toString(),"SYN-G02",absent);}
    private FusionAuthContainmentVerifier verifier(boolean absent){return new FusionAuthContainmentVerifier(ENDPOINT,TENANT,"synthetic-read-only-key","SYN-G02",absent,CLOCK,r->{requests.add(r);return replies.removeFirst();});}
    private static FusionAuthContainmentVerifier.Reply reply(int code,String body){return new FusionAuthContainmentVerifier.Reply(code,body.getBytes(StandardCharsets.UTF_8));}
    private static String inactive(){return "{\"user\":{\"id\":\""+USER+"\",\"tenantId\":\""+TENANT+"\",\"active\":false}}";}
    @Test void observesExactInactiveSubjectUsingGetOnlyAndFixedNamespace(){
        replies.add(reply(200,inactive()));var observation=verifier(false).verify(subject(false)).orElseThrow();assertThat(observation.state()).isEqualTo(ManagedIdentityContainment.State.INACTIVE);assertThat(observation.observedAt()).isEqualTo(Instant.parse("2026-10-22T12:00:00.123Z"));assertThat(requests).hasSize(1);var r=requests.getFirst();assertThat(r.method()).isEqualTo("GET");assertThat(r.uri()).isEqualTo(URI.create("https://identity.example/api/user/"+USER));assertThat(r.headers().firstValue("X-FusionAuth-TenantId")).contains(TENANT.toString());assertThat(r.headers().firstValue("Authorization")).contains("synthetic-read-only-key");assertThat(r.bodyPublisher()).isEmpty();assertThat(observation.toString()).doesNotContain(USER.toString(),TENANT.toString());}
    @Test void activeMissingMalformedCoercedAndWrongSubjectsAreUnverified(){
        for(String body:List.of(inactive().replace("false","true"),inactive().replace("false","\"false\""),inactive().replace(USER.toString(),UUID.randomUUID().toString()),inactive().replace(TENANT.toString(),UUID.randomUUID().toString()),"{\"user\":{}}","not-json",inactive().replace("\"active\":false","\"active\":true,\"active\":false"))){replies.add(reply(200,body));assertThat(verifier(false).verify(subject(false))).isEmpty();}}
    @Test void wrongSourceConfigurationNeverMakesARequest(){
        var v=verifier(false);assertThat(v.verify(new ManagedIdentityContainment.Subject(UUID.randomUUID(),USER,ENDPOINT.toString(),"SYN-G02",false))).isEmpty();assertThat(v.verify(new ManagedIdentityContainment.Subject(TENANT,USER,"https://other.example/api/login","SYN-G02",false))).isEmpty();assertThat(v.verify(new ManagedIdentityContainment.Subject(TENANT,USER,ENDPOINT.toString(),"OTHER",false))).isEmpty();assertThat(v.verify(subject(true))).isEmpty();assertThat(requests).isEmpty();}
    @Test void absenceNeedsExplicitPolicyAndPositiveAuthenticatedNamespace(){
        replies.add(reply(404,""));assertThat(verifier(false).verify(subject(false))).isEmpty();assertThat(requests).hasSize(1);requests.clear();replies.add(reply(404,""));replies.add(reply(200,"{\"tenant\":{\"id\":\""+TENANT+"\",\"state\":\"Active\"}}"));assertThat(verifier(true).verify(subject(true)).orElseThrow().state()).isEqualTo(ManagedIdentityContainment.State.ABSENT_IN_CONFIRMED_TENANT);assertThat(requests).hasSize(2);assertThat(requests.get(1).uri()).isEqualTo(URI.create("https://identity.example/api/tenant/"+TENANT));assertThat(requests).allSatisfy(r->assertThat(r.method()).isEqualTo("GET"));}
    @Test void wrongPendingOrUnauthorizedNamespaceCannotProveAbsence(){
        for(var response:List.of(reply(401,""),reply(200,"{\"tenant\":{\"id\":\""+UUID.randomUUID()+"\",\"state\":\"Active\"}}"),reply(200,"{\"tenant\":{\"id\":\""+TENANT+"\",\"state\":\"PendingDelete\"}}"))){replies.add(reply(404,""));replies.add(response);assertThat(verifier(true).verify(subject(true))).isEmpty();}}
    @Test void oversizeProviderErrorsAndInterruptedCallsStayUnverified(){
        replies.add(new FusionAuthContainmentVerifier.Reply(200,new byte[65537]));assertThat(verifier(false).verify(subject(false))).isEmpty();for(int status:List.of(400,401,403,429,500,503)){replies.add(reply(status,"PRIVATE-PROVIDER-BODY"));assertThat(verifier(false).verify(subject(false))).isEmpty();}var v=new FusionAuthContainmentVerifier(ENDPOINT,TENANT,"synthetic-read-only-key","SYN-G02",false,CLOCK,r->{throw new InterruptedException();});try{assertThat(v.verify(subject(false))).isEmpty();assertThat(Thread.currentThread().isInterrupted()).isTrue();}finally{Thread.interrupted();}}
    @Test void transactionsAndUnsafeConfigurationAreRejectedBeforeIo(){
        TransactionSynchronizationManager.setActualTransactionActive(true);try{assertThatThrownBy(()->verifier(false).verify(subject(false))).isInstanceOf(IllegalStateException.class);}finally{TransactionSynchronizationManager.setActualTransactionActive(false);}assertThat(requests).isEmpty();for(String uri:List.of("http://identity.example/api/login","https://user:secret@identity.example/api/login","https://identity.example/api/login?private=value","https://identity.example/other")){assertThatThrownBy(()->new FusionAuthContainmentVerifier(URI.create(uri),TENANT,"synthetic-read-only-key","SYN-G02",false,CLOCK)).isInstanceOf(IllegalArgumentException.class).hasNoCause();}}
    @Test void streamingSubscriberCancelsAtItsRealByteLimit(){var body=new FusionAuthContainmentVerifier.BoundedBody();var cancelled=new AtomicBoolean();body.onSubscribe(new Flow.Subscription(){public void request(long n){}public void cancel(){cancelled.set(true);}});body.onNext(List.of(ByteBuffer.allocate(65537)));assertThat(cancelled).isTrue();assertThat(body.getBody().toCompletableFuture()).isCompletedExceptionally();}
}
