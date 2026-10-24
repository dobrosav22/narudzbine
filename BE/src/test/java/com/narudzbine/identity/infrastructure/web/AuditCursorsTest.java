package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class AuditCursorsTest {
    private static final Instant NOW=Instant.parse("2026-10-21T00:00:00Z");
    private static final UUID ACTOR=UUID.fromString("019a0000-0000-7000-8000-000000000001"),ORG=UUID.fromString("019a0000-0000-7000-8000-000000000002"),EVENT=UUID.fromString("019a0000-0000-7000-8000-000000000003");
    private static String key(int value){byte[] k=new byte[32];Arrays.fill(k,(byte)value);return Base64.getEncoder().encodeToString(k);}
    @Test void previousKeyWindowRetainsScopedCursorButNeverAnotherMode(){
        var clock=Clock.fixed(NOW,ZoneOffset.UTC);var scope=new AuditCursors.Scope("ORGANIZATION",ACTOR,ORG,"RS",null,"ORGANIZATION_UPDATED",25);var p=new AuditCursors.Position(NOW,EVENT,NOW.plusSeconds(86400));
        String token=new AuditCursors(key(1),"","",clock).encode(scope,p);var rotated=new AuditCursors(key(2),key(1),NOW.plusSeconds(3600).toString(),clock);assertThat(rotated.decode(token,scope)).isEqualTo(p);
        assertThatThrownBy(()->rotated.decode(token,new AuditCursors.Scope("PLATFORM",ACTOR,null,null,ORG,"ORGANIZATION_UPDATED",25))).isInstanceOf(AuthHttpFailure.class);
        assertThatThrownBy(()->new AuditCursors(key(2),key(1),NOW.plusSeconds(3600).toString(),Clock.fixed(NOW.plusSeconds(3600),ZoneOffset.UTC)).decode(token,scope)).isInstanceOf(AuthHttpFailure.class);
    }
    @Test void expiredAndMalformedPositionsOrKeyWindowsFailClosed(){
        var clock=Clock.fixed(NOW,ZoneOffset.UTC);var scope=new AuditCursors.Scope("PLATFORM",ACTOR,null,null,null,null,25);var c=new AuditCursors(key(1),"","",clock);
        String expired=c.encode(scope,new AuditCursors.Position(NOW,EVENT,NOW));assertThatThrownBy(()->c.decode(expired,scope)).isInstanceOf(AuthHttpFailure.class);
        String invalid=c.encode(scope,new AuditCursors.Position(NOW.plusNanos(1),EVENT,NOW.plusSeconds(10)));assertThatThrownBy(()->c.decode(invalid,scope)).isInstanceOf(AuthHttpFailure.class);
        assertThatThrownBy(()->new AuditCursors(key(1),key(2),NOW.plusSeconds(86401).toString(),clock)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new AuditCursors(key(1),"",NOW.plusSeconds(1).toString(),clock)).isInstanceOf(IllegalArgumentException.class);
    }
}
