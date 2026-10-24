package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.AccountRevisions;
import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.identity.application.MemberService;
import com.narudzbine.identity.application.SessionService;
import com.narudzbine.organizations.api.MembershipAccess;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/organization/members")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class MemberController {
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final BusinessAuthorization authorization;
    private final MemberService members;
    private final AccountRevisions revisions;
    private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;
    private final TransactionTemplate transaction;
    MemberController(SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,
            MemberService members,AccountRevisions revisions,SessionTransportPolicy policy,LoginThrottle throttle,PlatformTransactionManager manager) {
        this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.members=members;
        this.revisions=revisions;this.policy=policy;this.throttle=throttle;
        transaction=new TransactionTemplate(manager);transaction.setTimeout(10);
    }
    @GetMapping
    Page list(HttpServletRequest request) {
        AuthController.noBody(request);var query=MemberRequests.query(request);var selected=policy.select(request);admit(selected,false);
        return transaction.execute(status -> {
            var principal=sessions.authenticate(selected.secret(),selected.transport());var scope=scope(principal.accountId());
            var result=members.list(scope.organizationId(),query.page(),query.size(),query.state(),query.role(),query.total());
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            return new Page(result.items().stream().map(this::response).toList(),query.page(),query.size(),result.total());
        });
    }
    @PutMapping("/{accountId}/role")
    ResponseEntity<AccountResponses.Account> role(@PathVariable String accountId,HttpServletRequest request) throws IOException {
        return change(accountId,request,MemberService.Action.ROLE);
    }
    @PostMapping("/{accountId}/deactivation")
    ResponseEntity<AccountResponses.Account> deactivate(@PathVariable String accountId,HttpServletRequest request) throws IOException {
        return change(accountId,request,MemberService.Action.DEACTIVATE);
    }
    @PostMapping("/{accountId}/reactivation")
    ResponseEntity<AccountResponses.Account> reactivate(@PathVariable String accountId,HttpServletRequest request) throws IOException {
        return change(accountId,request,MemberService.Action.REACTIVATE);
    }
    private ResponseEntity<AccountResponses.Account> change(String accountId,HttpServletRequest request,MemberService.Action action) throws IOException {
        AuthController.noQuery(request);UUID target=LocationRequests.id(accountId,"PATH","accountId");var selected=policy.select(request);
        String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null;
        var input=MemberRequests.change(request,action==MemberService.Action.ROLE);admit(selected,true);
        return transaction.execute(status -> {
            var principal=sessions.authenticateForMemberWrite(selected.secret(),selected.transport(),target);
            if(selected.transport()==SessionTransport.BROWSER) { sessions.requireCsrf(selected.secret(),csrf); }
            var scope=scope(principal.accountId());
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            var result=members.change(scope,target,input.expectedRevision(),action,input.role());
            var response=ResponseEntity.ok();
            if(action==MemberService.Action.DEACTIVATE && target.equals(scope.accountId()) && selected.transport()==SessionTransport.BROWSER) {
                response.header("Set-Cookie",policy.clearCookie().toString());
            }
            return response.body(response(result));
        });
    }
    private BusinessScope scope(UUID actor) {
        var member=memberships.lockForAuthorization(actor).orElseThrow(() -> new MemberFailure(MemberFailure.Reason.NOT_FOUND));
        return authorization.require(actor,member.organizationId(),member.country(),BusinessCapability.READ_OWN_ORGANIZATION);
    }
    private void admit(SessionTransportPolicy.Selected selected,boolean write) {
        UUID actor=transaction.execute(status -> sessions.authenticate(selected.secret(),selected.transport()).accountId());throttle.admitApi(actor,write);
    }
    private AccountResponses.Account response(MemberService.Member m) {
        return new AccountResponses.Account(m.id(),revisions.encode(m.id(),m.revision()),m.organizationId(),"BUSINESS",m.email(),m.displayName(),
                m.role().name(),m.state(),m.languageOverride(),m.homeLocationId(),AccountResponses.time(m.createdAt()),AccountResponses.time(m.updatedAt()));
    }
    record Page(List<AccountResponses.Account> items,int page,int size,Long total) { }
}
