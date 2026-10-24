package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class SupportCursorsTest {
    private static final Instant NOW=Instant.parse("2026-10-21T00:00:00Z");
    private static final UUID ACTOR=UUID.fromString("019a0000-0000-7000-8000-000000000001"),ORG=UUID.fromString("019a0000-0000-7000-8000-000000000002"),EVENT=UUID.fromString("019a0000-0000-7000-8000-000000000003");
    private static String key(int value){byte[] k=new byte[32];Arrays.fill(k,(byte)value);return Base64.getEncoder().encodeToString(k);}
    @Test void previousKeyWindowRetainsScopedCursorButNeverAnotherMode(){
        var clock=Clock.fixed(NOW,ZoneOffset.UTC);var scope=new SupportCursors.Scope(ACTOR,EVENT,ORG,"RS",ORG,25);var p=new SupportCursors.Position(NOW,EVENT,NOW.plusSeconds(1800));
        String token=new SupportCursors(key(1),"","",clock).encode(scope,p);var rotated=new SupportCursors(key(2),key(1),NOW.plusSeconds(900).toString(),clock);assertThat(rotated.decode(token,scope)).isEqualTo(p);
        assertThatThrownBy(()->rotated.decode(token,new SupportCursors.Scope(ACTOR,ORG,ORG,"RS",ORG,25))).isInstanceOf(AuthHttpFailure.class);
        assertThatThrownBy(()->new SupportCursors(key(2),key(1),NOW.plusSeconds(900).toString(),Clock.fixed(NOW.plusSeconds(900),ZoneOffset.UTC)).decode(token,scope)).isInstanceOf(AuthHttpFailure.class);
    }
    @Test void expiredAndMalformedPositionsOrKeyWindowsFailClosed(){
        var clock=Clock.fixed(NOW,ZoneOffset.UTC);var scope=new SupportCursors.Scope(ACTOR,EVENT,ORG,"RS",ORG,25);var c=new SupportCursors(key(1),"","",clock);
        String expired=c.encode(scope,new SupportCursors.Position(NOW,EVENT,NOW));assertThatThrownBy(()->c.decode(expired,scope)).isInstanceOf(AuthHttpFailure.class);
        String invalid=c.encode(scope,new SupportCursors.Position(NOW.plusNanos(1),EVENT,NOW.plusSeconds(10)));assertThatThrownBy(()->c.decode(invalid,scope)).isInstanceOf(AuthHttpFailure.class);
        assertThatThrownBy(()->new SupportCursors(key(1),key(2),NOW.plusSeconds(1801).toString(),clock)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new SupportCursors(key(1),"",NOW.plusSeconds(1).toString(),clock)).isInstanceOf(IllegalArgumentException.class);
    }
}
