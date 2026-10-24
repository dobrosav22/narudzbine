package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
class ReconciliationRequestsTest {
 @Test void malformedCandidateRevisionReportsItsNestedField()throws Exception{for(String value:java.util.List.of("null","1","\"\"")){var request=new MockHttpServletRequest();request.setContentType("application/json");request.setContent(("{\"expectedRevision\":\"preview\",\"lines\":[{\"productId\":\"019a0000-0000-7000-8000-000000000001\",\"expectedRevision\":"+value+",\"availableCount\":0}]}").getBytes(StandardCharsets.UTF_8));assertThatThrownBy(()->ReconciliationRequests.batch(request)).isInstanceOfSatisfying(AuthHttpFailure.class,f->assertThat(f.fields.getFirst().path()).isEqualTo("/lines/0/expectedRevision"));}}
}
