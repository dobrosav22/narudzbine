package com.narudzbine.identity.infrastructure.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.narudzbine.identity.api.InvalidCsrf;
import com.narudzbine.identity.api.InvalidSession;
import com.narudzbine.identity.api.SessionTransport;
import jakarta.servlet.http.Cookie;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class SessionTransportPolicyTest {
    private static final String SECRET = "a".repeat(43);
    private final SessionTransportPolicy policy = new SessionTransportPolicy(Set.of("https://app.example"));

    @Test
    void rejectsAmbiguousCredentialsEvenOnSafeRequests() {
        var request = new MockHttpServletRequest("GET", "/api/v1/me");
        request.setCookies(new Cookie(SessionTransportPolicy.COOKIE_NAME, SECRET));
        request.addHeader("Authorization", "");
        assertThatThrownBy(() -> policy.select(request)).isInstanceOf(SessionTransportPolicy.AmbiguousTransport.class);
        request.removeHeader("Authorization");
        request.setCookies(new Cookie(SessionTransportPolicy.COOKIE_NAME, SECRET), new Cookie(SessionTransportPolicy.COOKIE_NAME, SECRET));
        assertThatThrownBy(() -> policy.select(request)).isInstanceOf(SessionTransportPolicy.AmbiguousTransport.class);
        request.setCookies();
        request.addHeader("Authorization", "Bearer " + SECRET);
        request.addHeader("Authorization", "Bearer " + SECRET);
        assertThatThrownBy(() -> policy.select(request)).isInstanceOf(SessionTransportPolicy.AmbiguousTransport.class);
        request.removeHeader("Authorization");
        request.addHeader("Authorization", "Bearer " + SECRET);
        request.setCookies(new Cookie("__Host-narudzbine_preauth", SECRET));
        assertThatThrownBy(() -> policy.select(request)).isInstanceOf(SessionTransportPolicy.AmbiguousTransport.class);
    }

    @Test
    void browserUnsafeRequestsRequireExactlyOneAllowedOrigin() {
        var request = new MockHttpServletRequest("POST", "/api/v1/auth/logout");
        request.setCookies(new Cookie(SessionTransportPolicy.COOKIE_NAME, SECRET));
        for (String origin : new String[] {"null", "https://app.example.evil", "http://app.example", "https://app.example:444"}) {
            request.removeHeader("Origin"); request.addHeader("Origin", origin);
            assertThatThrownBy(() -> policy.select(request)).isInstanceOf(InvalidCsrf.class);
        }
        request.removeHeader("Origin");
        assertThatThrownBy(() -> policy.select(request)).isInstanceOf(InvalidCsrf.class);
        request.addHeader("Origin", "https://app.example");
        var selection = policy.select(request);
        assertThat(selection.transport()).isEqualTo(SessionTransport.BROWSER);
        assertThat(selection.toString()).doesNotContain(SECRET);
        request.addHeader("Origin", "https://app.example");
        assertThatThrownBy(() -> policy.select(request)).isInstanceOf(InvalidCsrf.class);
    }

    @Test
    void nativeCredentialsCannotBypassBrowserOriginProtection() {
        var request = new MockHttpServletRequest("POST", "/api/v1/auth/logout");
        request.addHeader("Authorization", "Bearer " + SECRET);
        assertThat(policy.select(request).transport()).isEqualTo(SessionTransport.NATIVE);
        request.addHeader("Origin", "https://app.example");
        assertThatThrownBy(() -> policy.select(request)).isInstanceOf(InvalidCsrf.class);
        request.removeHeader("Origin"); request.removeHeader("Authorization");
        request.addHeader("Authorization", "Bearer bad token");
        assertThatThrownBy(() -> policy.select(request)).isInstanceOf(InvalidSession.class);
    }

    @Test
    void cookiesAreHostOnlySecureAndHttpOnly() {
        assertThat(policy.sessionCookie(SECRET).toString()).contains("Secure", "HttpOnly", "SameSite=Lax", "Path=/")
                .doesNotContain("Domain=");
        assertThat(policy.clearCookie().toString()).contains("Max-Age=0");
        assertThatThrownBy(() -> new SessionTransportPolicy(Set.of("*"))).isInstanceOf(IllegalArgumentException.class);
    }
}
