package com.narudzbine.shared.infrastructure.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.narudzbine.shared.infrastructure.database.DatabaseReadiness;
import com.narudzbine.shared.api.UuidGenerator;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class SafeRequestFilterTest {
    @Test
    void sensitiveInputsNeverEnterRequestLogsAndDatabaseFailureIsGeneric() throws Exception {
        var readiness = mock(DatabaseReadiness.class);
        when(readiness.isAvailable()).thenReturn(false);
        var filter = new SafeRequestFilter(readiness, new ListenerPorts(), new UuidGenerator(java.time.Clock.systemUTC()));
        var request = new MockHttpServletRequest("POST", "/private/secret-path");
        request.setQueryString("token=secret-query");
        request.addHeader("Authorization", "Bearer secret-bearer");
        request.addHeader("Cookie", "session=secret-cookie");
        request.addHeader("X-Request-Id", "secret-injected-id");
        request.setContent("secret-password".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var response = new MockHttpServletResponse();
        Logger logger = (Logger) LoggerFactory.getLogger(SafeRequestFilter.class);
        var capture = new ListAppender<ILoggingEvent>();
        capture.start();
        logger.addAppender(capture);
        try {
            filter.doFilter(request, response, (req, res) -> {
                throw new AssertionError("Database failure must not reach business handlers");
            });
            assertThat(response.getStatus()).isEqualTo(503);
            assertThat(response.getContentAsString()).contains("SERVICE_UNAVAILABLE").doesNotContain("secret");
            assertThat(response.getHeader("X-Request-Id")).isNotEqualTo("secret-injected-id");
            assertThat(java.util.UUID.fromString(response.getHeader("X-Request-Id")).version()).isEqualTo(7);
            assertThat(capture.list).hasSize(1);
            String logged = capture.list.getFirst().getFormattedMessage()
                    + capture.list.getFirst().getKeyValuePairs();
            assertThat(logged).doesNotContain("secret", "Authorization", "Cookie", "/private");
            assertThat(org.slf4j.MDC.get("requestId")).isNull();
        } finally {
            logger.detachAppender(capture);
            capture.stop();
        }
    }
}
