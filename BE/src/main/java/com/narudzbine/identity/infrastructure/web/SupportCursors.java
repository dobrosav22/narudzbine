package com.narudzbine.identity.infrastructure.web;
import java.time.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import tools.jackson.databind.json.JsonMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
final class SupportCursors {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final byte[] current,previous;private final Instant previousUntil;private final Clock clock;
    SupportCursors(@Value("${identity.http.revision-key}")String key,@Value("${support.cursor.previous-key:}")String previous,@Value("${support.cursor.previous-until:}")String until,Clock clock){
        current=Base64.getDecoder().decode(key);this.previous=previous.isEmpty()?null:Base64.getDecoder().decode(previous);previousUntil=until.isEmpty()?null:Instant.parse(until);this.clock=clock;
        if(current.length<32||this.previous!=null&&(this.previous.length<32||previousUntil==null||previousUntil.isAfter(clock.instant().plusSeconds(1800)))||this.previous==null&&previousUntil!=null)throw new IllegalArgumentException("Invalid support cursor configuration");
    }
    record Scope(UUID actor,UUID context,UUID organization,String country,UUID order,int size){}
    record Position(Instant at,UUID id,Instant expires){}
    private record Payload(Scope scope,Instant at,UUID id,Instant expires){}
    String encode(Scope scope,Position p){String prefix="v1."+id(current)+"."+Base64.getUrlEncoder().withoutPadding().encodeToString(JSON.writeValueAsBytes(new Payload(scope,p.at(),p.id(),p.expires())));return prefix+"."+sign(current,prefix);}
    Position decode(String token,Scope scope){try{
        var parts=token.split("\\.",-1);if(parts.length!=4||!parts[0].equals("v1"))throw new IllegalArgumentException();
        byte[] key=parts[1].equals(id(current))?current:previous!=null&&clock.instant().isBefore(previousUntil)&&parts[1].equals(id(previous))?previous:null;
        String prefix=String.join(".",Arrays.copyOf(parts,3));if(key==null||!MessageDigest.isEqual(sign(key,prefix).getBytes(StandardCharsets.US_ASCII),parts[3].getBytes(StandardCharsets.US_ASCII)))throw new IllegalArgumentException();
        var p=JSON.readValue(Base64.getUrlDecoder().decode(parts[2]),Payload.class);
        if(!Objects.equals(scope,p.scope())||p.at()==null||p.at().getNano()%1000000!=0||p.id()==null||p.id().version()!=7||p.id().variant()!=2||p.expires()==null||!clock.instant().isBefore(p.expires())||p.expires().isAfter(clock.instant().plusSeconds(1800)))throw new IllegalArgumentException();
        return new Position(p.at(),p.id(),p.expires());
    }catch(RuntimeException invalid){throw StockRequests.invalid("cursor");}}
    private static String id(byte[] key){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key)).substring(0,16);}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private static String sign(byte[] key,String value){try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(("narudzbine/support-cursor/"+value).getBytes(StandardCharsets.US_ASCII)));}catch(GeneralSecurityException e){throw new IllegalStateException(e);}}
}
