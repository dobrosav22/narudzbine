package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class StockCursorsTest {
 private final Instant now=Instant.parse("2026-10-19T12:00:00Z");private final UUID vendor=UUID.randomUUID(),product=UUID.randomUUID();
 private byte[] key(int n){byte[] k=new byte[32];Arrays.fill(k,(byte)n);return k;}
 private StockCursors codec(int n,Instant at){return new StockCursors(key(n),null,null,Clock.fixed(at,ZoneOffset.UTC));}
 private String token(){return codec(1,now).encode(vendor,product,25,new StockCursors.Position(now,product,now.plusSeconds(86400)));}
 @Test void roundTripBindsScopeFilterSizeAndSignature(){var c=codec(1,now);String t=token();assertThat(c.decode(t,vendor,product,25).at()).isEqualTo(now);assertThatThrownBy(()->c.decode(t,UUID.randomUUID(),product,25)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(t,vendor,null,25)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(t,vendor,product,1)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(t+"x",vendor,product,25)).isInstanceOf(AuthHttpFailure.class);}
 @Test void expiresExactlyAfterTwentyFourHours(){assertThatThrownBy(()->codec(1,now.plusSeconds(86400)).decode(token(),vendor,product,25)).isInstanceOf(AuthHttpFailure.class);}
 @Test void previousKeyIsAcceptedOnlyBeforeItsExplicitRetirement(){var until=now.plusSeconds(600);var c=new StockCursors(key(2),key(1),until,Clock.fixed(now,ZoneOffset.UTC));assertThat(c.decode(token(),vendor,product,25).id()).isEqualTo(product);var retired=new StockCursors(key(2),key(1),until,Clock.fixed(until,ZoneOffset.UTC));assertThatThrownBy(()->retired.decode(token(),vendor,product,25)).isInstanceOf(AuthHttpFailure.class);}
 @Test void previousKeyCannotBeConfiguredBeyondTwentyFourHours(){assertThatThrownBy(()->new StockCursors(key(2),key(1),now.plusSeconds(86401),Clock.fixed(now,ZoneOffset.UTC))).isInstanceOf(IllegalArgumentException.class);}
}
