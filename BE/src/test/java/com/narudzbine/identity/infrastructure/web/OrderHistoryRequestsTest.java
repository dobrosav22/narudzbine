package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import com.narudzbine.organizations.api.Country;
class OrderHistoryRequestsTest {
 @Test void optionalBoundsAreStrictAndDoNotApplyReportRestrictions(){var r=new MockHttpServletRequest();assertThat(OrderHistoryRequests.query(r,false).size()).isEqualTo(25);r.addParameter("from","0001-01-01");r.addParameter("to","9999-12-31");var bounds=OrderHistoryRequests.query(r,false).filters().bounds(Country.RS);assertThat(bounds.from()).isBefore(bounds.until());}
 @Test void invalidDuplicateAndUnknownFiltersReject(){for(String field:new String[]{"from","to"}){for(String value:new String[]{"2026-02-29","2026-1-01","0000-01-01","+2026-01-01","2026-01-01T00:00:00Z",""}){var r=new MockHttpServletRequest();r.addParameter(field,value);assertThatThrownBy(()->OrderHistoryRequests.query(r,false)).isInstanceOf(AuthHttpFailure.class);}}for(String value:new String[]{"0","101","01","-1","1.0"}){var r=new MockHttpServletRequest();r.addParameter("size",value);assertThatThrownBy(()->OrderHistoryRequests.query(r,false)).isInstanceOf(AuthHttpFailure.class);}var r=new MockHttpServletRequest();r.addParameter("size","1","2");assertThatThrownBy(()->OrderHistoryRequests.query(r,false)).isInstanceOf(AuthHttpFailure.class);}
 @Test void reversedAndEventFiltersReject(){var r=new MockHttpServletRequest();r.addParameter("from","2026-03-02");r.addParameter("to","2026-03-01");assertThatThrownBy(()->OrderHistoryRequests.query(r,false)).isInstanceOf(AuthHttpFailure.class);for(String field:new String[]{"state","partnerId","from","to","sort","includeTotal","page"}){var e=new MockHttpServletRequest();e.addParameter(field,"anything");assertThatThrownBy(()->OrderHistoryRequests.query(e,true)).isInstanceOf(AuthHttpFailure.class);}}
 @Test void countryLocalInclusiveDaysRespectSpringAndAutumnDst(){for(Country country:Country.values()){for(var entry:java.util.Map.of("2026-03-29",23L,"2026-10-25",25L).entrySet()){var r=new MockHttpServletRequest();r.addParameter("from",entry.getKey());r.addParameter("to",entry.getKey());var bounds=OrderHistoryRequests.query(r,false).filters().bounds(country);assertThat(Duration.between(bounds.from(),bounds.until()).toHours()).isEqualTo(entry.getValue());}}}
}
