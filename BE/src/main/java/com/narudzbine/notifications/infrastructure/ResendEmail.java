package com.narudzbine.notifications.infrastructure;

import com.narudzbine.notifications.api.ProviderDelivery;
import java.net.URI;
import java.net.http.HttpRequest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

public final class ResendEmail implements ProviderDelivery.Email,AutoCloseable {
    private final String key;private final ProviderHttp.Exchange exchange;private final Clock clock;private final JsonMapper json=JsonMapper.builder().build();
    public ResendEmail(String key,Clock clock){this(key,clock,new ProviderHttp.Bounded());}
    ResendEmail(String key,Clock clock,ProviderHttp.Exchange exchange){
        if(key==null||!key.matches("[A-Za-z0-9_-]{10,256}"))throw new IllegalArgumentException("Explicit Resend API key required");this.key=key;this.clock=clock;this.exchange=exchange;
    }
    public void close(){if(exchange instanceof AutoCloseable closeable)try{closeable.close();}catch(Exception unavailable){throw new IllegalStateException("Provider shutdown unavailable");}}
    public ProviderDelivery.Result send(UUID id,ProviderDelivery.Mail mail){
        try {
            var request=HttpRequest.newBuilder(URI.create("https://api.resend.com/emails")).timeout(Duration.ofSeconds(10))
                .header("Authorization","Bearer "+key).header("Idempotency-Key",id.toString()).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(Map.of("from",mail.from(),"to",List.of(mail.to()),"subject",mail.subject(),"text",mail.text(),"html",mail.html())))).build();
            var r=exchange.send(request);if(r.body().length>65536)return ProviderDelivery.Result.of(ProviderDelivery.Status.UNKNOWN);
            if(r.status()>=200&&r.status()<300){var body=json.readTree(r.body());UUID reference=UUID.fromString(body.path("id").asString());return new ProviderDelivery.Result(ProviderDelivery.Status.ACCEPTED,reference.toString(),0);}
            if(r.status()==409&&"concurrent_idempotent_requests".equals(json.readTree(r.body()).path("name").asString()))return new ProviderDelivery.Result(ProviderDelivery.Status.RETRY,null,1);
            if(r.status()==429||r.status()>=500)return new ProviderDelivery.Result(ProviderDelivery.Status.RETRY,null,retryAfter(r.retryAfter(),clock));
            return ProviderDelivery.Result.of(ProviderDelivery.Status.REJECTED);
        }catch(InterruptedException e){Thread.currentThread().interrupt();return ProviderDelivery.Result.of(ProviderDelivery.Status.UNKNOWN);}
        catch(Exception e){return ProviderDelivery.Result.of(ProviderDelivery.Status.UNKNOWN);}
    }
    static long retryAfter(String value,Clock clock){
        if(value==null)return 0;
        try {long delay=value.matches("[0-9]{1,7}")?Long.parseLong(value):Duration.between(clock.instant(),ZonedDateTime.parse(value,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()).getSeconds();return Math.max(0,Math.min(86400,delay));}
        catch(RuntimeException invalid){return 0;}
    }
}
