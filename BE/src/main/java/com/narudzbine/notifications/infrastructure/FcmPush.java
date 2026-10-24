package com.narudzbine.notifications.infrastructure;

import com.narudzbine.notifications.api.ProviderDelivery;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.*;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

public final class FcmPush implements ProviderDelivery.Push,AutoCloseable {
    private final String environment,project,email,keyId;private final RSAPrivateKey key;private final Clock clock;private final ProviderHttp.Exchange exchange;private final JsonMapper json=JsonMapper.builder().build();
    private volatile String access;private volatile Instant expires=Instant.EPOCH;private final java.util.concurrent.locks.ReentrantLock refresh=new java.util.concurrent.locks.ReentrantLock();
    public FcmPush(String environment,String project,String email,String keyId,String pem,Clock clock){this(environment,project,email,keyId,pem,clock,new ProviderHttp.Bounded());}
    FcmPush(String environment,String project,String email,String keyId,String pem,Clock clock,ProviderHttp.Exchange exchange){
        if(environment.equals("unconfigured")||project.equals("unconfigured")||!environment.matches("[a-z][a-z0-9-]{0,39}")||!project.matches("[a-z][a-z0-9-]{4,62}")||!email.matches("[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\\.iam\\.gserviceaccount\\.com")||!keyId.matches("[A-Za-z0-9_-]{1,100}"))throw new IllegalArgumentException("Explicit isolated FCM service account required");
        this.environment=environment;this.project=project;this.email=email;this.keyId=keyId;this.clock=clock;this.exchange=exchange;
        try {byte[] encoded=Base64.getMimeDecoder().decode(pem.replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----",""));key=(RSAPrivateKey)KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(encoded));if(key.getModulus().bitLength()<2048||key.getModulus().bitLength()>4096)throw new IllegalArgumentException();}
        catch(Exception e){throw new IllegalArgumentException("FCM private key unavailable");}
    }
    public String environment(){return environment;}public String projectId(){return project;}
    public void close(){if(exchange instanceof AutoCloseable closeable)try{closeable.close();}catch(Exception unavailable){throw new IllegalStateException("Provider shutdown unavailable");}}
    public ProviderDelivery.Result send(String token,Map<String,String> data){
        try {
            var message=new java.util.LinkedHashMap<String,Object>();message.put("token",token);message.put("data",data);
            boolean challenge="DEVICE_VERIFICATION".equals(data.get("kind"));
            message.put("android",Map.of("ttl","120s","priority",challenge?"normal":"high"));message.put("webpush",Map.of("headers",Map.of("TTL","120")));
            message.put("apns",Map.of("headers",Map.of("apns-priority",challenge?"5":"10","apns-push-type",challenge?"background":"alert"),"payload",Map.of("aps",challenge?Map.of("content-available",1):Map.of("sound","default"))));
            if(!challenge)message.put("notification",Map.of("title","Narudzbine","body",data.getOrDefault("preview","Narudzbine")));
            var request=HttpRequest.newBuilder(URI.create("https://fcm.googleapis.com/v1/projects/"+project+"/messages:send")).timeout(Duration.ofSeconds(5))
                .header("Authorization","Bearer "+accessToken()).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(Map.of("message",message)))).build();
            var r=exchange.send(request);if(r.body().length>65536)return ProviderDelivery.Result.of(ProviderDelivery.Status.UNKNOWN);
            if(r.status()==429||r.status()>=500)return new ProviderDelivery.Result(ProviderDelivery.Status.RETRY,null,Math.max(r.status()==429?60:0,ResendEmail.retryAfter(r.retryAfter(),clock)));
            if(r.status()==401){access=null;return new ProviderDelivery.Result(ProviderDelivery.Status.RETRY,null,60);}
            var body=json.readTree(r.body());if(r.status()==200){String name=body.path("name").asString("");if(!name.matches("projects/"+project+"/messages/[A-Za-z0-9%:_./-]{1,512}"))return ProviderDelivery.Result.of(ProviderDelivery.Status.UNKNOWN);return new ProviderDelivery.Result(ProviderDelivery.Status.ACCEPTED,name,0);}
            for(var detail:body.path("error").path("details")){if("type.googleapis.com/google.firebase.fcm.v1.FcmError".equals(detail.path("@type").asString())&&Set.of("UNREGISTERED","SENDER_ID_MISMATCH").contains(detail.path("errorCode").asString()))return ProviderDelivery.Result.of(ProviderDelivery.Status.INVALID_TOKEN);}
            return ProviderDelivery.Result.of(ProviderDelivery.Status.REJECTED);
        }catch(InterruptedException e){Thread.currentThread().interrupt();return ProviderDelivery.Result.of(ProviderDelivery.Status.UNKNOWN);}
        catch(Exception e){return ProviderDelivery.Result.of(ProviderDelivery.Status.UNKNOWN);}
    }
    private String accessToken()throws Exception {
        Instant now=clock.instant();if(access!=null&&now.plusSeconds(60).isBefore(expires))return access;
        if(!refresh.tryLock(1,java.util.concurrent.TimeUnit.SECONDS))throw new IllegalStateException("FCM authorization busy");
        try {
        now=clock.instant();if(access!=null&&now.plusSeconds(60).isBefore(expires))return access;
        var encoder=Base64.getUrlEncoder().withoutPadding();String header=encoder.encodeToString(json.writeValueAsBytes(Map.of("alg","RS256","typ","JWT","kid",keyId)));
        String body=encoder.encodeToString(json.writeValueAsBytes(Map.of("iss",email,"scope","https://www.googleapis.com/auth/firebase.messaging","aud","https://oauth2.googleapis.com/token","iat",now.getEpochSecond(),"exp",now.plusSeconds(3600).getEpochSecond())));
        String content=header+"."+body;var signer=Signature.getInstance("SHA256withRSA");signer.initSign(key);signer.update(content.getBytes(StandardCharsets.US_ASCII));String assertion=content+"."+encoder.encodeToString(signer.sign());
        String form="grant_type="+URLEncoder.encode("urn:ietf:params:oauth:grant-type:jwt-bearer",StandardCharsets.UTF_8)+"&assertion="+URLEncoder.encode(assertion,StandardCharsets.UTF_8);
        var r=exchange.send(HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/token")).timeout(Duration.ofSeconds(3)).header("Content-Type","application/x-www-form-urlencoded").POST(HttpRequest.BodyPublishers.ofString(form)).build());
        if(r.status()!=200||r.body().length>65536)throw new IllegalStateException("FCM authorization unavailable");var payload=json.readTree(r.body());String value=payload.path("access_token").asString("");long lifetime=payload.path("expires_in").asLong(0);
        if(value.length()>8192||!"Bearer".equalsIgnoreCase(payload.path("token_type").asString())||!value.matches("[A-Za-z0-9._~+/-]{10,8192}=*")||lifetime<120||lifetime>3600)throw new IllegalStateException("FCM authorization unavailable");
        access=value;expires=now.plusSeconds(lifetime);return access;
        }finally{refresh.unlock();}
    }
}
