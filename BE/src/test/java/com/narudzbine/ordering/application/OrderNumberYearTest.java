package com.narudzbine.ordering.application;
import static org.assertj.core.api.Assertions.assertThat;
import com.narudzbine.organizations.api.Country;
import java.time.Instant;
import org.junit.jupiter.api.Test;
class OrderNumberYearTest {
 @Test void vendorYearChangesAtLocalMidnightWhileUtcYearStillPrevious(){for(var country:Country.values()){assertThat(JdbcOrders.localYear(country,Instant.parse("2026-12-31T22:59:59.999Z"))).isEqualTo(2026);assertThat(JdbcOrders.localYear(country,Instant.parse("2026-12-31T23:00:00Z"))).isEqualTo(2027);}}
}
