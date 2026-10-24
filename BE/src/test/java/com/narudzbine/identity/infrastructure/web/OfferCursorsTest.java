package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class OfferCursorsTest {
 private final Instant now=Instant.parse("2026-10-19T12:00:00Z");private final UUID vendor=UUID.randomUUID(),product=UUID.randomUUID();
 private byte[] key(int n){byte[] k=new byte[32];Arrays.fill(k,(byte)n);return k;}
 private OfferCursors codec(int n,Instant at){return new OfferCursors(key(n),null,null,Clock.fixed(at,ZoneOffset.UTC));}
 private String token(){return codec(1,now).encode(vendor,product,vendor,17,25,new OfferCursors.Position(product,now.plusSeconds(86400)));}
 @Test void roundTripBindsScopeFilterSizeAndSignature(){var c=codec(1,now);String t=token();assertThatThrownBy(()->c.decode(t,vendor,product,UUID.randomUUID(),17,25)).isInstanceOf(AuthHttpFailure.class);assertThat(c.decode(t,vendor,product,vendor,17,25).id()).isEqualTo(product);assertThatThrownBy(()->c.decode(t,UUID.randomUUID(),product,vendor,17,25)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(t,vendor,null,vendor,17,25)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(t,vendor,product,vendor,17,1)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->c.decode(t+"x",vendor,product,vendor,17,25)).isInstanceOf(AuthHttpFailure.class);}
 @Test void sourceGenerationIsBound(){assertThatThrownBy(()->codec(1,now).decode(token(),vendor,product,vendor,18,25)).isInstanceOf(AuthHttpFailure.class);}
 @Test void expiresExactlyAfterTwentyFourHours(){assertThatThrownBy(()->codec(1,now.plusSeconds(86400)).decode(token(),vendor,product,vendor,17,25)).isInstanceOf(AuthHttpFailure.class);}
 @Test void previousKeyIsAcceptedOnlyBeforeItsExplicitRetirement(){var until=now.plusSeconds(600);var c=new OfferCursors(key(2),key(1),until,Clock.fixed(now,ZoneOffset.UTC));assertThat(c.decode(token(),vendor,product,vendor,17,25).id()).isEqualTo(product);var retired=new OfferCursors(key(2),key(1),until,Clock.fixed(until,ZoneOffset.UTC));assertThatThrownBy(()->retired.decode(token(),vendor,product,vendor,17,25)).isInstanceOf(AuthHttpFailure.class);}
 @Test void previousKeyCannotBeConfiguredBeyondTwentyFourHours(){assertThatThrownBy(()->new OfferCursors(key(2),key(1),now.plusSeconds(86401),Clock.fixed(now,ZoneOffset.UTC))).isInstanceOf(IllegalArgumentException.class);}
}
