package com.narudzbine.notifications.infrastructure;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

public final class EmailCallbacks {
    private final JdbcTemplate jdbc;private final Clock clock;private final TransactionTemplate tx;private final byte[] current,previous;private final Instant previousUntil;
    private final JsonMapper json=JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    public EmailCallbacks(JdbcTemplate jdbc,Clock clock,PlatformTransactionManager manager,String current,String previous,Instant previousUntil){
        this.jdbc=jdbc;this.clock=clock;this.current=key(current);this.previous=previous==null||previous.isEmpty()?null:key(previous);this.previousUntil=previousUntil;
        if(this.previous!=null&&(previousUntil==null||previousUntil.isAfter(clock.instant().plusSeconds(86400))))throw new IllegalArgumentException("Explicit bounded previous webhook key lifetime required");tx=new TransactionTemplate(manager);tx.setTimeout(10);
    }
    public void receive(String id,String timestamp,String signature,byte[] raw){
        if(id==null||!id.matches("[A-Za-z0-9_-]{1,512}")||timestamp==null||!timestamp.matches("[0-9]{1,12}")||signature==null||signature.length()>512||raw.length>65536)throw new Rejected();
        Instant at=clock.instant();long seconds=Long.parseLong(timestamp);if(Math.abs(at.getEpochSecond()-seconds)>300)throw new Rejected();
        byte[] prefix=(id+"."+timestamp+".").getBytes(StandardCharsets.US_ASCII);boolean valid=verify(current,prefix,raw,signature);
        if(previous!=null&&at.isBefore(previousUntil))valid|=verify(previous,prefix,raw,signature);if(!valid)throw new Rejected();
        UUID reference;String event;
        try {var value=json.readTree(raw);Instant.parse(value.path("created_at").asString());reference=UUID.fromString(value.path("data").path("email_id").asString());event=value.path("type").asString();if(!event.matches("email\\.[a-z_]{1,32}"))throw new IllegalArgumentException();}
        catch(RuntimeException invalid){throw new Rejected();}
        String hash;
        try{hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw));}catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException("Callback digest unavailable");}
        final String type=event;tx.executeWithoutResult(t->{
            advisory(jdbc,reference.toString());var existing=jdbc.queryForList("SELECT payload_hash FROM email_callback WHERE id=?",String.class,id);if(!existing.isEmpty()){if(!existing.getFirst().equals(hash))throw new Rejected();return;}
            jdbc.update("INSERT INTO email_callback(id,payload_hash,provider_reference,event_type,received_at) VALUES (?,?,?,?,?)",id,hash,reference,type,Timestamp.from(at.truncatedTo(java.time.temporal.ChronoUnit.MILLIS)));
            // Callback can precede the provider-result commit. The shared reference guard serializes both sides.
            boolean delivered=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM email_callback WHERE provider_reference=? AND event_type='email.delivered')",Boolean.class,reference);
            String state=delivered?"DELIVERED":Set.of("email.bounced","email.complained","email.failed").contains(type)?"FAILED":null;
            if(state!=null)jdbc.update("UPDATE external_job SET state=? WHERE provider_reference=? AND state IN('ACCEPTED','UNKNOWN')",state,reference.toString());
        });
    }
    static void advisory(JdbcTemplate jdbc,String reference){jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))","resend/"+reference);}
    private static byte[] key(String value){try{if(value==null||!value.startsWith("whsec_"))throw new IllegalArgumentException();byte[] key=Base64.getDecoder().decode(value.substring(6));if(key.length<24||key.length>64)throw new IllegalArgumentException();return key;}catch(RuntimeException e){throw new IllegalArgumentException("Webhook key unavailable");}}
    private static boolean verify(byte[] key,byte[] prefix,byte[] raw,String signature){try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));mac.update(prefix);byte[] expected=mac.doFinal(raw);boolean valid=false;for(String candidate:signature.split(" ")){if(!candidate.startsWith("v1,"))continue;try{valid|=MessageDigest.isEqual(expected,Base64.getDecoder().decode(candidate.substring(3)));}catch(IllegalArgumentException ignored){}}return valid;}catch(java.security.GeneralSecurityException impossible){throw new IllegalStateException("Webhook verification unavailable");}}
    public static final class Rejected extends RuntimeException {public Rejected(){super("Callback rejected");}}
}
