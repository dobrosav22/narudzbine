package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.InvalidCsrf;
import com.narudzbine.identity.api.InvalidSession;
import com.narudzbine.identity.api.SessionTransport;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.Collections;
import java.util.Set;
import org.springframework.http.ResponseCookie;

/** Selection/Origin policy only. The caller must authenticate and validate session CSRF in its transaction. */
public final class SessionTransportPolicy {
    public static final String COOKIE_NAME = "__Host-narudzbine_session";
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    private final Set<String> origins;

    public SessionTransportPolicy(Set<String> origins) {
        for (String origin : origins) {
            URI uri = URI.create(origin);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null || !uri.getPath().isEmpty()) {
                throw new IllegalArgumentException("Exact HTTPS origins are required.");
            }
        }
        this.origins = Set.copyOf(origins);
    }

    public Selected select(HttpServletRequest request) {
        var authorization = Collections.list(request.getHeaders("Authorization"));
        String cookie = null;
        int cookieCount = 0;
        int preAuthCount = 0;
        if (request.getCookies() != null) {
            for (var item : request.getCookies()) {
                if (COOKIE_NAME.equals(item.getName())) { cookie = item.getValue(); cookieCount++; }
                if ("__Host-narudzbine_preauth".equals(item.getName())) { preAuthCount++; }
            }
        }
        if (cookieCount > 1 || preAuthCount > 1 || authorization.size() > 1
                || ((cookieCount > 0 || preAuthCount > 0) && !authorization.isEmpty())) {
            throw new AmbiguousTransport();
        }
        if (cookieCount == 1) {
            validateSecret(cookie);
            if (!SAFE_METHODS.contains(request.getMethod())) { requireBrowserOrigin(request); }
            return new Selected(SessionTransport.BROWSER, cookie);
        }
        if (authorization.size() == 1) {
            requireNativeOrigin(request);
            String header = authorization.getFirst();
            if (!header.matches("(?i:Bearer) [A-Za-z0-9_-]{43}")) { throw new InvalidSession(); }
            return new Selected(SessionTransport.NATIVE, header.substring(7));
        }
        throw new InvalidSession();
    }

    public void requireBrowserOrigin(HttpServletRequest request) {
        var values = Collections.list(request.getHeaders("Origin"));
        if (values.size() != 1 || !origins.contains(values.getFirst())) { throw new InvalidCsrf(); }
    }

    public void requireNativeOrigin(HttpServletRequest request) {
        if (request.getHeaders("Origin").hasMoreElements()) { throw new InvalidCsrf(); }
    }

    public ResponseCookie sessionCookie(String secret) {
        validateSecret(secret);
        return cookie(secret).build();
    }

    public ResponseCookie clearCookie() { return cookie("").maxAge(0).build(); }

    private ResponseCookie.ResponseCookieBuilder cookie(String value) {
        return ResponseCookie.from(COOKIE_NAME, value).secure(true).httpOnly(true).sameSite("Lax").path("/");
    }

    private static void validateSecret(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{43}")) { throw new InvalidSession(); }
    }

    public record Selected(SessionTransport transport, String secret) {
        @Override public String toString() { return "Selected[" + transport + ", redacted]"; }
    }

    public static final class AmbiguousTransport extends RuntimeException {
        public AmbiguousTransport() { super("Ambiguous authentication transport."); }
    }
}
