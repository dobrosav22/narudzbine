package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.identity.application.OwnershipService;
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
@RequestMapping("/api/v1/organization/ownership-transfers")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class OwnershipController {
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final BusinessAuthorization authorization;
    private final OwnershipService transfers;
    private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;
    private final TransactionTemplate transaction;
    OwnershipController(SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,
            OwnershipService transfers,SessionTransportPolicy policy,LoginThrottle throttle,PlatformTransactionManager manager) {
        this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.transfers=transfers;this.policy=policy;this.throttle=throttle;
        transaction=new TransactionTemplate(manager);transaction.setTimeout(10);
    }
    @PostMapping
    ResponseEntity<Result> request(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);var selected=policy.select(request);String csrf=csrf(request,selected);
        var body=AuthRequests.object(request,java.util.Set.of("recipientAccountId","expectedRevision"));
        var errors=new java.util.ArrayList<AuthErrors.FieldError>();UUID parsedRecipient=null;String parsedRevision=null;
        try { parsedRecipient=LocationRequests.id(body.path("recipientAccountId").isString()?body.path("recipientAccountId").asString():null,"BODY","/recipientAccountId"); }
        catch(AuthHttpFailure failure) { errors.addAll(failure.fields); }
        try { parsedRevision=ContactRequests.revision(body); } catch(AuthHttpFailure failure) { errors.addAll(failure.fields); }
        if(!errors.isEmpty()) { errors.sort(java.util.Comparator.comparing(AuthErrors.FieldError::path));throw new AuthHttpFailure(errors); }
        var input=new Request(parsedRecipient,parsedRevision);admit(selected,true);
        return transaction.execute(status -> {
            var principal=sessions.authenticateForMemberWrite(selected.secret(),selected.transport(),input.recipientAccountId());checkCsrf(selected,csrf);
            var created=transfers.request(scope(principal.accountId()),principal,input.recipientAccountId(),input.expectedRevision());
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            return ResponseEntity.status(created.replay()?200:201).header("Location","/api/v1/organization/ownership-transfers/"+created.transfer().id()).body(response(created.transfer()));
        });
    }
    @GetMapping("/{transferId}")
    Result get(@PathVariable String transferId,HttpServletRequest request) {
        AuthController.noQuery(request);AuthController.noBody(request);UUID id=LocationRequests.id(transferId,"PATH","transferId");var selected=policy.select(request);admit(selected,false);
        return transaction.execute(status -> {
            var principal=sessions.authenticate(selected.secret(),selected.transport());var result=transfers.get(scope(principal.accountId()),id);
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return response(result);
        });
    }
    @DeleteMapping("/{transferId}")
    ResponseEntity<Void> revoke(@PathVariable String transferId,HttpServletRequest request) {
        AuthController.noQuery(request);AuthController.noBody(request);UUID id=LocationRequests.id(transferId,"PATH","transferId");var selected=policy.select(request);String csrf=csrf(request,selected);admit(selected,true);
        return transaction.execute(status -> {
            var principal=sessions.authenticateForTransferWrite(selected.secret(),selected.transport(),id);checkCsrf(selected,csrf);
            transfers.revoke(scope(principal.accountId()),id);sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return ResponseEntity.noContent().build();
        });
    }
    @PostMapping("/{transferId}/acceptance")
    ResponseEntity<Result> accept(@PathVariable String transferId,HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);UUID id=LocationRequests.id(transferId,"PATH","transferId");var selected=policy.select(request);String csrf=csrf(request,selected);
        String revision=ContactRequests.revisionCommand(request);admit(selected,true);
        return transaction.execute(status -> {
            var principal=sessions.authenticateForTransferWrite(selected.secret(),selected.transport(),id);checkCsrf(selected,csrf);
            var scope=scope(principal.accountId());sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            var result=transfers.accept(scope,principal,id,revision);var response=ResponseEntity.ok();
            if(!result.replay() && selected.transport()==SessionTransport.BROWSER) { response.header("Set-Cookie",policy.clearCookie().toString()); }
            return response.body(response(result.transfer()));
        });
    }
    private BusinessScope scope(UUID actor) {
        var member=memberships.lockForAuthorization(actor).orElseThrow(() -> new TransferFailure(TransferFailure.Reason.NOT_FOUND));
        return authorization.require(actor,member.organizationId(),member.country(),BusinessCapability.READ_OWN_ORGANIZATION);
    }
    private static String csrf(HttpServletRequest r,SessionTransportPolicy.Selected s) { return s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null; }
    private void checkCsrf(SessionTransportPolicy.Selected s,String csrf) { if(s.transport()==SessionTransport.BROWSER) { sessions.requireCsrf(s.secret(),csrf); } }
    private void admit(SessionTransportPolicy.Selected s,boolean write) { UUID actor=transaction.execute(status -> sessions.authenticate(s.secret(),s.transport()).accountId());throttle.admitApi(actor,write); }
    private static Result response(OwnershipService.View v) { return new Result(v.id(),v.revision(),v.recipientAccountId(),v.state(),AccountResponses.time(v.expiresAt())); }
    record Request(UUID recipientAccountId,String expectedRevision) { }
    record Result(UUID id,String revision,UUID recipientAccountId,String state,String expiresAt) { }
}
