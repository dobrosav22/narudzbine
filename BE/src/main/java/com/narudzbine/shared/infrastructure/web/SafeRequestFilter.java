package com.narudzbine.shared.infrastructure.web;

import com.narudzbine.shared.infrastructure.database.DatabaseReadiness;
import com.narudzbine.shared.api.UuidGenerator;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public final class SafeRequestFilter extends OncePerRequestFilter {
    private static final Logger LOGGER = LoggerFactory.getLogger(SafeRequestFilter.class);
    private final DatabaseReadiness readiness;
    private final ListenerPorts ports;
    private final UuidGenerator ids;

    public SafeRequestFilter(DatabaseReadiness readiness, ListenerPorts ports, UuidGenerator ids) {
        this.readiness = readiness;
        this.ports = ports;
        this.ids = ids;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // Never echo an arbitrary incoming ID, URI, query, body, cookie or Authorization header to logs.
        String requestId = ids.next().toString();
        long started = System.nanoTime();
        response.setHeader("X-Request-Id", requestId);
        response.setHeader("Cache-Control", "no-store");
        MDC.put("requestId", requestId);
        try {
            if (!ports.isManagement(request.getLocalPort()) && !readiness.isAvailable()) {
                response.setStatus(503);
                response.setContentType("application/problem+json");
                response.getWriter().write("{\"type\":\"urn:narudzbine:problem:service_unavailable\","
                        + "\"title\":\"Service temporarily unavailable\",\"status\":503,"
                        + "\"code\":\"SERVICE_UNAVAILABLE\",\"requestId\":\"" + requestId + "\",\"errors\":[]}");
                return;
            }
            chain.doFilter(request, response);
        } finally {
            LOGGER.atInfo().addKeyValue("event", "request_completed").addKeyValue("requestId", requestId)
                    .addKeyValue("status", response.getStatus())
                    .addKeyValue("durationMs", (System.nanoTime() - started) / 1_000_000).log("HTTP request completed");
            MDC.remove("requestId");
        }
    }
}
