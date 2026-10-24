package com.narudzbine.identity.infrastructure.web;
import java.time.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.SecretKeySpec;
import tools.jackson.databind.json.JsonMapper;
final class StockCursors {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final byte[] current,previous;private final Clock clock;private final Instant previousUntil;
 StockCursors(byte[] current,byte[] previous,Instant previousUntil,Clock clock){if(current.length<32||previous!=null&&(previous.length<32||previousUntil==null||previousUntil.isAfter(clock.instant().plusSeconds(86400)))){throw new IllegalArgumentException("Invalid cursor key configuration");}this.current=current.clone();this.previous=previous==null?null:previous.clone();this.previousUntil=previousUntil;this.clock=clock;}
 record Position(Instant at,UUID id,Instant expires){}
 private record Payload(UUID vendor,UUID product,int size,Instant at,UUID id,Instant expires){}
 String encode(UUID vendor,UUID product,int size,Position p){var value=new Payload(vendor,product,size,p.at(),p.id(),p.expires());String prefix="v1."+id(current)+"."+Base64.getUrlEncoder().withoutPadding().encodeToString(JSON.writeValueAsBytes(value));return prefix+"."+sign(current,prefix);}
 Position decode(String token,UUID vendor,UUID product,int size){try{var parts=token.split("\\.",-1);if(parts.length!=4||!parts[0].equals("v1")){throw new IllegalArgumentException();}byte[] key=parts[1].equals(id(current))?current:previous!=null&&clock.instant().isBefore(previousUntil)&&parts[1].equals(id(previous))?previous:null;String prefix=String.join(".",Arrays.copyOf(parts,3));if(key==null||!MessageDigest.isEqual(sign(key,prefix).getBytes(StandardCharsets.US_ASCII),parts[3].getBytes(StandardCharsets.US_ASCII))){throw new IllegalArgumentException();}var p=JSON.readValue(Base64.getUrlDecoder().decode(parts[2]),Payload.class);if(!p.vendor().equals(vendor)||!Objects.equals(p.product(),product)||p.size()!=size||!clock.instant().isBefore(p.expires())||p.expires().isAfter(clock.instant().plusSeconds(86400))){throw new IllegalArgumentException();}return new Position(p.at(),p.id(),p.expires());}catch(RuntimeException e){throw StockRequests.invalid("cursor");}}
 private static String id(byte[] key){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key)).substring(0,16);}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 private static String sign(byte[] key,String value){try{var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(("narudzbine/stock-cursor/"+value).getBytes(StandardCharsets.US_ASCII)));}catch(GeneralSecurityException e){throw new IllegalStateException(e);}}
}
