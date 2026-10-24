package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class InboxCursorsTest {
 private final Instant now=Instant.parse("2026-10-20T12:00:00Z");
 private String key(int value){byte[] bytes=new byte[32];Arrays.fill(bytes,(byte)value);return Base64.getEncoder().encodeToString(bytes);}
 @Test void bindsAccountOrganizationFilterSizeAndExpiryIncludingNullPlatformScope(){
  var c=new InboxCursors(key(1),"","",Clock.fixed(now,ZoneOffset.UTC));UUID actor=UUID.randomUUID(),id=UUID.randomUUID();var p=new InboxCursors.Position(now,id,now.plusSeconds(86400));String token=c.encode("inbox",null,actor,null,25,p);assertThat(c.decode(token,"inbox",null,actor,null,25)).isEqualTo(p);
  assertThatThrownBy(()->c.decode(token,"inbox",null,UUID.randomUUID(),null,25)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(token,"inbox",UUID.randomUUID(),actor,null,25)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(token,"inbox",null,actor,true,25)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(token,"inbox",null,actor,null,100)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(token+"x","inbox",null,actor,null,25)).isInstanceOf(AuthHttpFailure.class);var expired=new InboxCursors(key(1),"","",Clock.fixed(now.plusSeconds(86400),ZoneOffset.UTC));assertThatThrownBy(()->expired.decode(token,"inbox",null,actor,null,25)).isInstanceOf(AuthHttpFailure.class);
 }
 @Test void previousKeyHasBoundedOverlap(){
  var old=new InboxCursors(key(1),"","",Clock.fixed(now,ZoneOffset.UTC));UUID actor=UUID.randomUUID();var p=new InboxCursors.Position(now,UUID.randomUUID(),now.plusSeconds(86400));String token=old.encode("inbox",null,actor,false,1,p);var rotated=new InboxCursors(key(2),key(1),now.plusSeconds(86400).toString(),Clock.fixed(now,ZoneOffset.UTC));assertThat(rotated.decode(token,"inbox",null,actor,false,1)).isEqualTo(p);assertThatThrownBy(()->new InboxCursors(key(2),key(1),now.plusSeconds(86401).toString(),Clock.fixed(now,ZoneOffset.UTC))).isInstanceOf(IllegalArgumentException.class);
 }
}
