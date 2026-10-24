package com.narudzbine.ordering.application;
import static org.assertj.core.api.Assertions.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
class OrderEventIdsTest {
 @Test void randomCandidateAtSameMillisecondCannotReverseCausality(){UUID previous=UUID.fromString("019a0000-0000-7abc-bfff-fffffffffff0"),candidate=UUID.fromString("019a0000-0000-7000-8000-000000000000");UUID next=OrderEventIds.after(previous,candidate);assertThat(next.toString()).isGreaterThan(previous.toString());assertThat(next.version()).isEqualTo(7);assertThat(next.variant()).isEqualTo(2);assertThat(OrderEventIds.after(previous,next)).isEqualTo(next);}
 @Test void lowerRandomBitsOverflowPreservesVersionAndVariant(){UUID previous=UUID.fromString("019a0000-0000-7000-bfff-ffffffffffff"),next=OrderEventIds.after(previous,previous);assertThat(next.toString()).isEqualTo("019a0000-0000-7001-8000-000000000000");}
 @Test void exhaustedTimestampFailsInsteadOfInventingEventTime(){UUID previous=UUID.fromString("019a0000-0000-7fff-bfff-ffffffffffff");assertThatThrownBy(()->OrderEventIds.after(previous,previous)).isInstanceOf(IllegalStateException.class);}
}
