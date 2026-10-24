package com.narudzbine.notifications.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.notifications.api.ProviderDelivery;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.net.*;
import java.net.http.HttpRequest;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class ProviderProtocolTest {
    static final JsonMapper JSON=JsonMapper.builder().build();static final Clock CLOCK=Clock.fixed(Instant.parse("2026-10-20T12:00:00Z"),ZoneOffset.UTC);
    static byte[] body(HttpRequest request)throws Exception {var bytes=new ByteArrayOutputStream();var done=new CompletableFuture<byte[]>();request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>(){public void onSubscribe(Flow.Subscription s){s.request(Long.MAX_VALUE);}public void onNext(ByteBuffer b){byte[] data=new byte[b.remaining()];b.get(data);bytes.writeBytes(data);}public void onError(Throwable e){done.completeExceptionally(e);}public void onComplete(){done.complete(bytes.toByteArray());}});return done.get(2,TimeUnit.SECONDS);}
    static ProviderHttp.Reply reply(int status,String body,String retry){return new ProviderHttp.Reply(status,body.getBytes(StandardCharsets.UTF_8),retry);}
    static KeyPair pair()throws Exception{var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);return generator.generateKeyPair();}
    static FcmPush fcm(KeyPair pair,ProviderHttp.Exchange exchange){return new FcmPush("synthetic","synthetic-project","sender@synthetic.iam.gserviceaccount.com","synthetic-key",Base64.getEncoder().encodeToString(pair.getPrivate().getEncoded()),CLOCK,exchange);}
    @Test void resendUsesStableUuidAndIdenticalPayloadOnRetry()throws Exception {
        var requests=new ArrayList<HttpRequest>();UUID reference=UUID.randomUUID(),id=UUID.randomUUID();var provider=new ResendEmail("synthetic_test_key",CLOCK,r->{requests.add(r);return reply(200,"{\"id\":\""+reference+"\"}",null);});var mail=new ProviderDelivery.Mail("sender@example.com","recipient@example.com","Subject","Text","<p>Text</p>");
        assertThat(provider.send(id,mail).status()).isEqualTo(ProviderDelivery.Status.ACCEPTED);assertThat(provider.send(id,mail).reference()).isEqualTo(reference.toString());assertThat(requests).hasSize(2);assertThat(body(requests.get(0))).isEqualTo(body(requests.get(1)));assertThat(requests.get(0).headers().firstValue("Idempotency-Key")).contains(id.toString());assertThat(requests.get(0).uri().toString()).isEqualTo("https://api.resend.com/emails");assertThat(mail.toString()).doesNotContain("recipient","Text");
    }
    @Test void resendClassifiesQuotaRejectionAndAmbiguousSuccessWithoutLeakingBodies(){
        for(int status:List.of(429,500,503)){var p=new ResendEmail("synthetic_test_key",CLOCK,r->reply(status,"sensitive-provider-body","120"));assertThat(p.send(UUID.randomUUID(),new ProviderDelivery.Mail("a","b","c","d","e"))).isEqualTo(new ProviderDelivery.Result(ProviderDelivery.Status.RETRY,null,120));}
        assertThat(new ResendEmail("synthetic_test_key",CLOCK,r->reply(400,"{}",null)).send(UUID.randomUUID(),new ProviderDelivery.Mail("a","b","c","d","e")).status()).isEqualTo(ProviderDelivery.Status.REJECTED);
        assertThat(new ResendEmail("synthetic_test_key",CLOCK,r->reply(200,"{\"id\":\"wrong\"}",null)).send(UUID.randomUUID(),new ProviderDelivery.Mail("a","b","c","d","e")).status()).isEqualTo(ProviderDelivery.Status.UNKNOWN);
    }
    @Test void fcmSignsScopedServiceAccountAssertionAndCachesOnlyBoundedBearer()throws Exception {
        var pair=pair();var requests=new ArrayList<HttpRequest>();var provider=fcm(pair,r->{requests.add(r);if(r.uri().getHost().equals("oauth2.googleapis.com"))return reply(200,"{\"access_token\":\"synthetic-access-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}",null);return reply(200,"{\"name\":\"projects/synthetic-project/messages/123\"}",null);});
        assertThat(provider.send("opaque-token",Map.of("kind","DEVICE_VERIFICATION","verificationCode","private-code")).status()).isEqualTo(ProviderDelivery.Status.ACCEPTED);assertThat(provider.send("opaque-token",Map.of("kind","ACTIVITY","preview","Update")).status()).isEqualTo(ProviderDelivery.Status.ACCEPTED);assertThat(requests).hasSize(3);
        String form=new String(body(requests.get(0)),StandardCharsets.UTF_8);String jwt=URLDecoder.decode(form.substring(form.indexOf("&assertion=")+11),StandardCharsets.UTF_8);var parts=jwt.split("\\.");var verifier=Signature.getInstance("SHA256withRSA");verifier.initVerify(pair.getPublic());verifier.update((parts[0]+"."+parts[1]).getBytes(StandardCharsets.US_ASCII));assertThat(verifier.verify(Base64.getUrlDecoder().decode(parts[2]))).isTrue();var claims=JSON.readTree(Base64.getUrlDecoder().decode(parts[1]));assertThat(claims.path("scope").asString()).isEqualTo("https://www.googleapis.com/auth/firebase.messaging");assertThat(claims.path("aud").asString()).isEqualTo("https://oauth2.googleapis.com/token");assertThat(claims.path("exp").asLong()-claims.path("iat").asLong()).isEqualTo(3600);
        var challenge=JSON.readTree(body(requests.get(1))).path("message");assertThat(challenge.has("notification")).isFalse();assertThat(challenge.path("apns").path("headers").path("apns-push-type").asString()).isEqualTo("background");var activity=JSON.readTree(body(requests.get(2))).path("message");assertThat(activity.path("notification").path("body").asString()).isEqualTo("Update");assertThat(activity.path("apns").path("headers").path("apns-push-type").asString()).isEqualTo("alert");assertThat(requests.get(0).timeout()).contains(Duration.ofSeconds(3));assertThat(requests.get(1).timeout()).contains(Duration.ofSeconds(5));
    }
    @Test void fcmNeverTreatsWrongProjectOrMalformedAcknowledgementAsSuccess()throws Exception {
        for(String code:List.of("UNREGISTERED","SENDER_ID_MISMATCH")){var p=fcm(pair(),r->r.uri().getHost().startsWith("oauth2")?reply(200,"{\"access_token\":\"synthetic-access-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}",null):reply(404,"{\"error\":{\"details\":[{\"@type\":\"type.googleapis.com/google.firebase.fcm.v1.FcmError\",\"errorCode\":\""+code+"\"}]}}",null));assertThat(p.send("opaque",Map.of()).status()).isEqualTo(ProviderDelivery.Status.INVALID_TOKEN);}
        var p=fcm(pair(),r->r.uri().getHost().startsWith("oauth2")?reply(200,"{\"access_token\":\"synthetic-access-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}",null):reply(200,"{\"name\":\"projects/production/messages/1\"}",null));assertThat(p.send("opaque",Map.of()).status()).isEqualTo(ProviderDelivery.Status.UNKNOWN);
    }
    @Test void fcmQuotaAndUnavailableRespectRetryAfterEvenWithoutJsonBody()throws Exception {
        for(int code:List.of(429,503)){var p=fcm(pair(),r->r.uri().getHost().startsWith("oauth2")?reply(200,"{\"access_token\":\"synthetic-access-token\",\"token_type\":\"Bearer\",\"expires_in\":3600}",null):reply(code,"","120"));assertThat(p.send("opaque",Map.of())).isEqualTo(new ProviderDelivery.Result(ProviderDelivery.Status.RETRY,null,120));}
    }
    @Test void boundedWireRejectsOversizedAndSlowBodyAndDoesNotFollowRedirects()throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var pool=Executors.newCachedThreadPool();server.setExecutor(pool);var target=new AtomicInteger();
        server.createContext("/large",e->{byte[] bytes=new byte[65537];e.sendResponseHeaders(200,bytes.length);e.getResponseBody().write(bytes);e.close();});
        server.createContext("/redirect",e->{e.getResponseHeaders().add("Location","/target");e.sendResponseHeaders(302,-1);e.close();});server.createContext("/target",e->{target.incrementAndGet();e.sendResponseHeaders(200,-1);e.close();});
        server.createContext("/slow",e->{e.sendResponseHeaders(200,2);e.getResponseBody().write('a');e.getResponseBody().flush();try{Thread.sleep(500);}catch(InterruptedException ignored){Thread.currentThread().interrupt();}try{e.getResponseBody().write('b');}finally{e.close();}});server.start();
        try{String base="http://127.0.0.1:"+server.getAddress().getPort();try(var http=new ProviderHttp.Bounded()){assertThatThrownBy(()->http.send(HttpRequest.newBuilder(URI.create(base+"/large")).GET().build())).isInstanceOf(Exception.class);assertThat(http.send(HttpRequest.newBuilder(URI.create(base+"/redirect")).GET().build()).status()).isEqualTo(302);assertThat(target).hasValue(0);assertThatThrownBy(()->http.send(HttpRequest.newBuilder(URI.create(base+"/slow")).timeout(Duration.ofMillis(100)).GET().build())).isInstanceOf(Exception.class);}}finally{server.stop(0);pool.shutdownNow();}
    }
    @Test void templateEscapesEveryLinkParameterWithoutRecursiveReplacementOrPrivatePreview(){
        var r=DeliveryText.render("sr-Latn-RS","PASSWORD_RESET","https://app.example/#/x?token=<\"&{2}",30);assertThat(r.html()).contains("&lt;&quot;&amp;{2}").doesNotContain("token=<");assertThat(r.text()).contains("{2}","30 minuta");for(String tag:List.of("en","sr-Latn-RS","bs-Latn-BA")){var notice=DeliveryText.render(tag,"MESSAGE_CREATED","https://app.example/#/notifications/opaque",0);assertThat(notice.subject()).doesNotContain("opaque");assertThat(notice.text()).contains("opaque");}assertThat(DeliveryText.render("unknown","MESSAGE_CREATED","https://app.example",0)).isEqualTo(DeliveryText.render("en","MESSAGE_CREATED","https://app.example",0));
    }
}
