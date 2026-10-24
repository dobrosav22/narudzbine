package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.BusinessAccessDenied;
import com.narudzbine.identity.api.BusinessAuthorization;
import com.narudzbine.identity.api.BusinessCapability;
import com.narudzbine.identity.api.BusinessScope;
import com.narudzbine.identity.api.RevisionConflict;
import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.identity.application.SessionService;
import com.narudzbine.identity.application.SupportedLocales;
import com.narudzbine.organizations.api.MembershipAccess;
import com.narudzbine.organizations.api.OrganizationRecord;
import com.narudzbine.organizations.api.OrganizationSettings;
import com.narudzbine.organizations.api.OrganizationType;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/organization")
@ConditionalOnProperty(name = "identity.http.enabled", havingValue = "true")
public final class OrganizationController {
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final BusinessAuthorization authorization;
    private final OrganizationSettings settings;
    private final SessionTransportPolicy policy;
    private final SupportedLocales locales;
    private final LoginThrottle throttle;
    private final ResourceRevisions revisions;
    private final TransactionTemplate transaction;

    OrganizationController(SessionService sessions, MembershipAccess memberships, BusinessAuthorization authorization,
            OrganizationSettings settings, SessionTransportPolicy policy, SupportedLocales locales, LoginThrottle throttle,
            ResourceRevisions revisions, PlatformTransactionManager manager) {
        this.sessions = sessions; this.memberships = memberships; this.authorization = authorization;
        this.settings = settings; this.policy = policy; this.locales = locales; this.throttle = throttle; this.revisions = revisions;
        transaction = new TransactionTemplate(manager); transaction.setTimeout(10);
    }

    @GetMapping
    Result get(HttpServletRequest request) {
        AuthController.noQuery(request); AuthController.noBody(request);
        var selected = policy.select(request); admit(selected, false);
        return transaction.execute(status -> {
            var principal = sessions.authenticate(selected.secret(), selected.transport());
            var scope = scope(principal.accountId(), BusinessCapability.READ_OWN_ORGANIZATION);
            var result = response(settings.read(scope.organizationId()));
            sessions.recordSuccessfulActivity(selected.secret(), selected.transport());
            return result;
        });
    }

    @PutMapping
    Result update(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);
        var selected = policy.select(request);
        String csrf = selected.transport() == SessionTransport.BROWSER ? AuthController.csrfHeader(request) : null;
        var input = OrganizationRequests.update(request, locales);
        admit(selected, true);
        return transaction.execute(status -> {
            var principal = sessions.authenticateForOrganizationWrite(selected.secret(), selected.transport());
            if (selected.transport() == SessionTransport.BROWSER) { sessions.requireCsrf(selected.secret(), csrf); }
            var scope = scope(principal.accountId(), BusinessCapability.MANAGE_ORGANIZATION_SETTINGS);
            var current = settings.read(scope.organizationId());
            if (!revisions.matches("organization/v1", current.id(), current.revision(), input.expectedRevision())) { throw new RevisionConflict(revisions.encode("organization/v1", current.id(), current.revision())); }
            if (input.values().registeredAddress().country() != scope.country()) {
                throw new AuthHttpFailure(422, "VALIDATION_FAILED", "/registeredAddress/country");
            }
            if (scope.organizationType() == OrganizationType.VENDOR && input.values().staffSubmissionRestricted()) {
                throw new AuthHttpFailure(422, "VALIDATION_FAILED", "/staffSubmissionRestricted");
            }
            var result = response(settings.replace(scope.accountId(), scope.organizationId(), input.values()));
            sessions.recordSuccessfulActivity(selected.secret(), selected.transport());
            return result;
        });
    }

    private BusinessScope scope(UUID account, BusinessCapability capability) {
        var membership = memberships.lockForAuthorization(account).orElseThrow(() ->
                new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE));
        return authorization.require(account, membership.organizationId(), membership.country(), capability);
    }
    private void admit(SessionTransportPolicy.Selected selected, boolean write) {
        UUID account = transaction.execute(status -> sessions.authenticate(selected.secret(), selected.transport()).accountId());
        throttle.admitApi(account, write);
    }
    private Result response(OrganizationRecord o){return OrganizationResponses.response(o,revisions);}
    record Result(UUID id, String revision, String displayName, String legalName, String type, String country, String currency,
            String registrationIdentifier, String taxIdentifier, OrganizationRecord.Address registeredAddress, String defaultLanguage,
            String state, boolean staffSubmissionRestricted, UUID partnerContactId, UUID ownerAccountId, String createdAt, String updatedAt) { }
}
