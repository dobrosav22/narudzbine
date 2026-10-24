package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.audit.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Clock;
import java.util.*;
import java.util.function.Function;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name = {"identity.http.enabled", "audit.holds.enabled"}, havingValue = "true")
public final class RetentionHoldsController {
    private final RetentionHolds holds;
    private final PrivateCaseReview operators;
    private final SessionService sessions;
    private final SupportAccessService scopes;
    private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;
    private final Clock clock;
    private final TransactionTemplate tx;

    RetentionHoldsController(RetentionHolds holds, PrivateCaseReview operators, SessionService sessions,
            SupportAccessService scopes, SessionTransportPolicy policy, LoginThrottle throttle,
            Clock clock, PlatformTransactionManager manager) {
        this.holds = holds; this.operators = operators; this.sessions = sessions; this.scopes = scopes;
        this.policy = policy; this.throttle = throttle; this.clock = clock;
        tx = new TransactionTemplate(manager); tx.setTimeout(10);
    }

    @PostMapping("/api/v1/admin/privacy-cases/{caseId}/holds")
    ResponseEntity<RetentionHolds.View> activate(@PathVariable String caseId, HttpServletRequest request) throws IOException {
        strict(request);
        UUID source = ContactRequests.id(caseId, "PATH", "caseId");
        var body = AuthRequests.object(request, Set.of("id", "reason", "caseReference"));
        var errors = new ArrayList<AuthErrors.FieldError>();
        String id = OrganizationRequests.text(body, "id", "", 36, false, errors);
        var context = context(body, errors);
        if (!errors.isEmpty()) throw new AuthHttpFailure(errors);
        UUID selected = ContactRequests.id(id, "BODY", "/id");
        return execute(request, source, true, actor -> holds.activate(actor, source, target(source), selected, context), true);
    }

    @GetMapping("/api/v1/admin/privacy-cases/{caseId}/holds/{holdId}")
    ResponseEntity<RetentionHolds.View> read(@PathVariable String caseId, @PathVariable String holdId, HttpServletRequest request) {
        strict(request); AuthController.noBody(request);
        UUID source = ContactRequests.id(caseId, "PATH", "caseId"), selected = ContactRequests.id(holdId, "PATH", "holdId");
        return execute(request, source, false, actor -> holds.read(actor, source, selected), false);
    }

    @PostMapping("/api/v1/admin/privacy-cases/{caseId}/holds/{holdId}/release")
    ResponseEntity<RetentionHolds.View> release(@PathVariable String caseId, @PathVariable String holdId,
                                               HttpServletRequest request) throws IOException {
        strict(request);
        UUID source = ContactRequests.id(caseId, "PATH", "caseId"), selected = ContactRequests.id(holdId, "PATH", "holdId");
        var body = AuthRequests.object(request, Set.of("expectedRevision", "reason", "caseReference"));
        var errors = new ArrayList<AuthErrors.FieldError>();
        String expected = OrganizationRequests.text(body, "expectedRevision", "", 128, false, errors);
        var context = context(body, errors);
        if (!errors.isEmpty()) throw new AuthHttpFailure(errors);
        return execute(request, source, true, actor -> holds.release(actor, source, selected, expected, context), false);
    }

    private ResponseEntity<RetentionHolds.View> execute(HttpServletRequest request, UUID caseId, boolean write,
            Function<PrivateCaseReview.Actor, RetentionHolds.View> action, boolean created) {
        var selected = policy.select(request);
        String csrf = write && selected.transport() == SessionTransport.BROWSER ? AuthController.csrfHeader(request) : null;
        UUID actor = tx.execute(status -> {
            UUID id = sessions.replayAdmissionAccount(selected.secret(), selected.transport());
            if (!scopes.platformAccount(id)) throw new PrivacyFailure("NOT_FOUND");
            operators.qualify(id); return id;
        });
        throttle.admitApi(actor, write);
        var result = tx.execute(status -> {
            var target = target(caseId);
            var locked = scopes.lock(target.organization(), Set.of()).orElseThrow(() -> new PrivacyFailure("NOT_FOUND"));
            if (!locked.country().equals(target.country())) throw new PrivacyFailure("NOT_FOUND");
            var principal = sessions.authenticateForProfileWrite(selected.secret(), selected.transport());
            if (!principal.platformAdministrator()) throw new PrivacyFailure("NOT_FOUND");
            if (write && selected.transport() == SessionTransport.BROWSER) sessions.requireCsrf(selected.secret(), csrf);
            operators.qualify(principal.accountId()); fresh(principal);
            var value = action.apply(new PrivateCaseReview.Actor(principal.accountId(), principal.sessionId(), selected.transport().name()));
            fresh(principal); sessions.recordSuccessfulActivity(selected.secret(), selected.transport()); return value;
        });
        var response = ResponseEntity.status(created ? 201 : 200).cacheControl(CacheControl.noStore()).header("Pragma", "no-cache");
        if (created) response.header(HttpHeaders.LOCATION, "/api/v1/admin/privacy-cases/" + caseId + "/holds/" + result.id());
        return response.body(result);
    }

    private PrivateCaseReview.Target target(UUID id) { return operators.route(id).orElseThrow(() -> new PrivacyFailure("NOT_FOUND")); }
    private void fresh(AuthenticatedSession principal) {
        var at = clock.instant();
        if (at.isBefore(principal.authenticatedAt()) || !at.isBefore(principal.authenticatedAt().plusSeconds(300)))
            throw new AuthHttpFailure(403, "REAUTHENTICATION_REQUIRED");
    }
    private static void strict(HttpServletRequest request) {
        AuthController.noQuery(request);
        if (request.getHeader("Idempotency-Key") != null)
            throw new AuthHttpFailure(List.of(new AuthErrors.FieldError("HEADER", "Idempotency-Key", "INVALID_VALUE")));
    }
    private static RetentionHolds.Context context(tools.jackson.databind.JsonNode body, List<AuthErrors.FieldError> errors) {
        return new RetentionHolds.Context(OrganizationRequests.text(body, "reason", "", 1000, false, errors),
                OrganizationRequests.text(body, "caseReference", "", 100, false, errors));
    }
}
