package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.PasswordLoginService;
import com.narudzbine.identity.application.PreAuthService;
import com.narudzbine.identity.application.SessionService;
import com.narudzbine.identity.application.LoginThrottle;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseCookie;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@ConditionalOnProperty(name = "identity.http.enabled", havingValue = "true")
public final class AuthController {
    static final String PRE_AUTH_COOKIE = "__Host-narudzbine_preauth";
    private final PasswordLoginService login;
    private final SessionService sessions;
    private final PreAuthService bootstrap;
    private final SessionTransportPolicy policy;
    private final AccountResponses responses;
    private final TransactionTemplate transaction;
    private final Clock clock;
    private final LoginThrottle throttle;

    AuthController(PasswordLoginService login, SessionService sessions, PreAuthService bootstrap,
            SessionTransportPolicy policy, AccountResponses responses, PlatformTransactionManager manager, Clock clock, LoginThrottle throttle) {
        this.login = login; this.sessions = sessions; this.bootstrap = bootstrap; this.policy = policy;
        this.responses = responses; this.transaction = new TransactionTemplate(manager); this.clock = clock;
        transaction.setTimeout(10);
        this.throttle = throttle;
    }

    @GetMapping("/bootstrap")
    Bootstrap bootstrap(HttpServletRequest request, HttpServletResponse response) {
        noQuery(request); policy.requireBrowserOrigin(request); noAuthorization(request);
        var result = bootstrap.create(request.getRemoteAddr());
        response.addHeader("Set-Cookie", preAuthCookie(result.binding(), 300).toString());
        return new Bootstrap(result.nonce(), AccountResponses.time(result.expiresAt()));
    }

    @PostMapping("/login")
    Result login(HttpServletRequest request, HttpServletResponse response) throws IOException {
        noQuery(request); noAuthorization(request);
        var input = AuthRequests.login(request);
        String preAuth = cookie(request, PRE_AUTH_COOKIE);
        String sessionCookie = cookie(request, SessionTransportPolicy.COOKIE_NAME);
        if (input.transport() == SessionTransport.BROWSER) {
            policy.requireBrowserOrigin(request);
            bootstrap.consume(input.preAuthNonce(), preAuth);
        } else {
            policy.requireNativeOrigin(request);
            if (preAuth != null || sessionCookie != null || input.preAuthNonce() != null) {
                throw new AuthHttpFailure(400, "AMBIGUOUS_AUTH_TRANSPORT");
            }
        }
        var credentials = login.login(input.email(), input.password(), input.transport(), input.deviceLabel(), request.getRemoteAddr());
        var result = transaction.execute(status -> {
            var principal = sessions.authenticate(credentials.secret(), input.transport());
            return new Result(responses.account(principal.accountId()), AccountResponses.session(credentials.session()),
                    input.transport() == SessionTransport.NATIVE ? credentials.secret() : null, credentials.csrfToken());
        });
        if (input.transport() == SessionTransport.BROWSER) {
            response.addHeader("Set-Cookie", policy.sessionCookie(credentials.secret()).toString());
            response.addHeader("Set-Cookie", preAuthCookie("", 0).toString());
        }
        return result;
    }

    @GetMapping("/csrf")
    Csrf csrf(HttpServletRequest request) {
        noQuery(request); policy.requireBrowserOrigin(request);
        var selected = policy.select(request);
        if (selected.transport() != SessionTransport.BROWSER) { throw new InvalidCsrf(); }
        admit(selected, false);
        return transaction.execute(status -> new Csrf(sessions.csrfToken(selected.secret())));
    }

    @PostMapping("/reauthentication")
    Result reauthenticate(HttpServletRequest request, HttpServletResponse response) throws IOException {
        noQuery(request);
        var selected = policy.select(request);
        String csrf = selected.transport() == SessionTransport.BROWSER ? csrfHeader(request) : null;
        var input = AuthRequests.reauthentication(request);
        var credentials = login.reauthenticate(selected.secret(), selected.transport(), csrf,
                input.password(), request.getRemoteAddr());
        var result = transaction.execute(status -> {
            var principal = sessions.authenticate(credentials.secret(), selected.transport());
            return new Result(responses.account(principal.accountId()), AccountResponses.session(credentials.session()),
                    selected.transport() == SessionTransport.NATIVE ? credentials.secret() : null, credentials.csrfToken());
        });
        if (selected.transport() == SessionTransport.BROWSER) {
            response.addHeader("Set-Cookie", policy.sessionCookie(credentials.secret()).toString());
        }
        return result;
    }

    @GetMapping("/sessions")
    Page list(HttpServletRequest request) {
        Set<String> allowed = Set.of("page", "size", "includeTotal");
        if (!allowed.containsAll(request.getParameterMap().keySet())) { throw new AuthHttpFailure(422, "VALIDATION_FAILED"); }
        int page = integer(request, "page", 0, 0, 10000);
        int size = integer(request, "size", 25, 1, 100);
        String total = parameter(request, "includeTotal", "false");
        if (!Set.of("true", "false").contains(total)) { throw new AuthHttpFailure(422, "VALIDATION_FAILED"); }
        var selected = policy.select(request);
        admit(selected, false);
        return transaction.execute(status -> {
            var all = sessions.list(selected.secret(), selected.transport());
            return new Page(all.stream().skip((long) page * size).limit(size).map(AccountResponses::session).toList(),
                    page, size, total.equals("true") ? all.size() : null);
        });
    }

    @PostMapping("/logout")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    void logout(HttpServletRequest request, HttpServletResponse response) {
        noQuery(request); noBody(request);
        var selected = policy.select(request);
        String csrf = selected.transport() == SessionTransport.BROWSER ? csrfHeader(request) : null;
        throttle.admitLogout(request.getRemoteAddr());
        try { admit(selected, true); }
        catch (InvalidSession exception) {
            // A retired credential may only repeat logout; it must not consume an active account's allowance.
            // logout below still validates the stored original token, transport and browser CSRF proof.
        }
        transaction.executeWithoutResult(status -> sessions.logout(selected.secret(), selected.transport(), csrf));
        if (selected.transport() == SessionTransport.BROWSER) { response.addHeader("Set-Cookie", policy.clearCookie().toString()); }
    }

    @DeleteMapping("/sessions/{sessionId}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    void revoke(@PathVariable String sessionId, HttpServletRequest request, HttpServletResponse response) {
        noQuery(request); noBody(request);
        UUID id;
        try { id = UUID.fromString(sessionId); }
        catch (IllegalArgumentException exception) { throw new AuthHttpFailure(422, "VALIDATION_FAILED"); }
        if (!id.toString().equals(sessionId)) { throw new AuthHttpFailure(422, "VALIDATION_FAILED"); }
        var selected = policy.select(request);
        admit(selected, true);
        boolean current = transaction.execute(status -> {
            var principal = authenticateMutation(request, selected);
            sessions.revokeOther(selected.secret(), selected.transport(), id);
            return principal.sessionId().equals(id);
        });
        if (current && selected.transport() == SessionTransport.BROWSER) { response.addHeader("Set-Cookie", policy.clearCookie().toString()); }
    }

    @PostMapping("/sessions/revoke-all")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    void revokeAll(HttpServletRequest request, HttpServletResponse response) {
        noQuery(request); noBody(request);
        var selected = policy.select(request);
        admit(selected, true);
        transaction.executeWithoutResult(status -> {
            var principal = authenticateMutation(request, selected);
            if (!clock.instant().isBefore(principal.authenticatedAt().plusSeconds(300))) {
                throw new AuthHttpFailure(403, "REAUTHENTICATION_REQUIRED");
            }
            sessions.revokeAll(selected.secret(), selected.transport());
        });
        if (selected.transport() == SessionTransport.BROWSER) { response.addHeader("Set-Cookie", policy.clearCookie().toString()); }
    }

    private AuthenticatedSession authenticateMutation(HttpServletRequest request, SessionTransportPolicy.Selected selected) {
        var principal = sessions.authenticate(selected.secret(), selected.transport());
        if (selected.transport() == SessionTransport.BROWSER) { sessions.requireCsrf(selected.secret(), csrfHeader(request)); }
        return principal;
    }
    private void admit(SessionTransportPolicy.Selected selected, boolean write) {
        UUID account = transaction.execute(status -> sessions.authenticate(selected.secret(), selected.transport()).accountId());
        throttle.admitApi(account, write);
    }
    static String csrfHeader(HttpServletRequest request) {
        var values = Collections.list(request.getHeaders("X-CSRF-Token"));
        if (values.size() != 1) { throw new InvalidCsrf(); }
        return values.getFirst();
    }
    private static String cookie(HttpServletRequest request, String name) {
        String value = null; int count = 0;
        if (request.getCookies() != null) {
            for (var cookie : request.getCookies()) { if (cookie.getName().equals(name)) { value = cookie.getValue(); count++; } }
        }
        if (count > 1) { throw new SessionTransportPolicy.AmbiguousTransport(); }
        return value;
    }
    private static void noAuthorization(HttpServletRequest request) {
        if (request.getHeaders("Authorization").hasMoreElements()) { throw new SessionTransportPolicy.AmbiguousTransport(); }
    }
    static void noQuery(HttpServletRequest request) {
        if (request.getQueryString() != null) { throw new AuthHttpFailure(422, "VALIDATION_FAILED"); }
    }
    static void noBody(HttpServletRequest request) {
        try {
            if (request.getInputStream().read() != -1) { throw new AuthHttpFailure(422, "VALIDATION_FAILED", ""); }
        } catch (IOException exception) { throw new AuthHttpFailure(400, "MALFORMED_REQUEST"); }
    }
    private static String parameter(HttpServletRequest request, String name, String fallback) {
        String[] values = request.getParameterValues(name);
        if (values == null) { return fallback; }
        if (values.length != 1) { throw new AuthHttpFailure(422, "VALIDATION_FAILED"); }
        return values[0];
    }
    private static int integer(HttpServletRequest request, String name, int fallback, int min, int max) {
        String value = parameter(request, name, Integer.toString(fallback));
        if (!value.matches("0|[1-9][0-9]{0,5}")) { throw new AuthHttpFailure(422, "VALIDATION_FAILED"); }
        int number = Integer.parseInt(value);
        if (number < min || number > max) { throw new AuthHttpFailure(422, "VALIDATION_FAILED"); }
        return number;
    }
    private static ResponseCookie preAuthCookie(String value, long seconds) {
        return ResponseCookie.from(PRE_AUTH_COOKIE, value).path("/").secure(true).httpOnly(true).sameSite("Lax").maxAge(seconds).build();
    }
    record Bootstrap(String nonce, String expiresAt) { @Override public String toString() { return "Bootstrap[redacted]"; } }
    record Csrf(String csrfToken) { @Override public String toString() { return "Csrf[redacted]"; } }
    record Result(AccountResponses.Account account, AccountResponses.Session session, String bearerToken, String csrfToken) {
        @Override public String toString() { return "SessionResult[redacted]"; }
    }
    record Page(List<AccountResponses.Session> items, int page, int size, Integer total) { }
}
