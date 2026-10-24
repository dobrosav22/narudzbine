package com.narudzbine.identity.infrastructure.web;

import static org.assertj.core.api.Assertions.*;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ReportRequestsTest {
    private ReportRequests.Query query(String from,String to,String grouping) {
        var r=new MockHttpServletRequest();r.setParameter("from",from);r.setParameter("to",to);r.setParameter("grouping",grouping);
        return ReportRequests.parse(r,true);
    }
    @Test void countryDaysRespectBothDstTransitions() {
        for(String country:new String[]{"RS","BA"}) {
            var spring=query("2026-03-29","2026-03-29","DAY").range(country,Instant.parse("2026-12-01T00:00:00Z"));
            var fall=query("2026-10-25","2026-10-25","DAY").range(country,Instant.parse("2026-12-01T00:00:00Z"));
            assertThat(Duration.between(spring.start(),spring.until())).isEqualTo(Duration.ofHours(23));
            assertThat(Duration.between(fall.start(),fall.until())).isEqualTo(Duration.ofHours(25));
        }
    }
    @Test void localTodayCanBeTomorrowInUtcCalendarAndFutureIsRejected() {
        Instant at=Instant.parse("2026-07-01T22:30:00Z");
        assertThat(query("2026-07-02","2026-07-02","DAY").range("RS",at).start()).isEqualTo(Instant.parse("2026-07-01T22:00:00Z"));
        assertThatThrownBy(()->query("2026-07-03","2026-07-03","DAY").range("BA",at)).isInstanceOf(AuthHttpFailure.class);
    }
}
