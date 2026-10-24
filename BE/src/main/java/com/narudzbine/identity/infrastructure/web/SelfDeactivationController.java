package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.identity.application.MemberService;
import com.narudzbine.identity.application.SessionService;
import com.narudzbine.organizations.api.MembershipAccess;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class SelfDeactivationController {
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final BusinessAuthorization authorization;
    private final MemberService members;
    private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;
    private final TransactionTemplate transaction;
    SelfDeactivationController(SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,
            MemberService members,SessionTransportPolicy policy,LoginThrottle throttle,PlatformTransactionManager manager) {
        this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.members=members;
        this.policy=policy;this.throttle=throttle;
        transaction=new TransactionTemplate(manager);transaction.setTimeout(10);
    }
    @PostMapping("/api/v1/me/deactivation")
    ResponseEntity<Void> deactivate(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);var selected=policy.select(request);
        String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null;
        var input=MemberRequests.change(request,false);
        UUID actor=admit(selected,true);
        return transaction.execute(status -> {
            var principal=sessions.authenticateForMemberWrite(selected.secret(),selected.transport(),actor);
            if(selected.transport()==SessionTransport.BROWSER) { sessions.requireCsrf(selected.secret(),csrf); }
            var scope=scope(principal.accountId());
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            members.change(scope,principal.accountId(),input.expectedRevision(),MemberService.Action.DEACTIVATE,null);
            var response=ResponseEntity.noContent();
            if(selected.transport()==SessionTransport.BROWSER) { response.header("Set-Cookie",policy.clearCookie().toString()); }
            return response.build();
        });
    }
    private BusinessScope scope(UUID actor) {
        var member=memberships.lockForAuthorization(actor).orElseThrow(() -> new MemberFailure(MemberFailure.Reason.NOT_FOUND));
        return authorization.require(actor,member.organizationId(),member.country(),BusinessCapability.READ_OWN_ORGANIZATION);
    }
    private UUID admit(SessionTransportPolicy.Selected selected,boolean write) {
        UUID actor=transaction.execute(status -> sessions.authenticate(selected.secret(),selected.transport()).accountId());throttle.admitApi(actor,write);return actor;
    }
}
