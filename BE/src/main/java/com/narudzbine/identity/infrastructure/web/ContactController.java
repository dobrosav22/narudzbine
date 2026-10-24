package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.identity.application.SessionService;
import com.narudzbine.organizations.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
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
@RequestMapping("/api/v1/organization/contacts")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class ContactController {
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final BusinessAuthorization authorization;
    private final BusinessContacts contacts;
    private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;
    private final ResourceRevisions revisions;
    private final TransactionTemplate transaction;
    private final byte[] creationKey;
    ContactController(SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,
            BusinessContacts contacts,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,PlatformTransactionManager manager,
            @org.springframework.beans.factory.annotation.Value("${identity.http.revision-key}") String creationKey) {
        this.sessions=sessions; this.memberships=memberships; this.authorization=authorization; this.contacts=contacts;
        this.policy=policy; this.throttle=throttle; this.revisions=revisions;
        this.creationKey=java.util.Base64.getDecoder().decode(creationKey);
        transaction=new TransactionTemplate(manager); transaction.setTimeout(10);
    }
    @GetMapping
    Page list(HttpServletRequest request) {
        AuthController.noBody(request); var query=ContactRequests.query(request); var selected=policy.select(request); admit(selected,false);
        return transaction.execute(status -> {
            var scope=scope(selected,false,null);
            var page=contacts.list(scope.organizationId(),query.page(),query.size(),query.state(),query.total());
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            return new Page(page.items().stream().map(this::response).toList(),query.page(),query.size(),page.total());
        });
    }
    @GetMapping("/{resourceId}")
    Result get(@PathVariable String resourceId,HttpServletRequest request) {
        AuthController.noQuery(request); AuthController.noBody(request);
        UUID id=ContactRequests.id(resourceId,"PATH","resourceId"); var selected=policy.select(request); admit(selected,false);
        return transaction.execute(status -> {
            var scope=scope(selected,false,null); var result=contacts.read(scope.organizationId(),id);
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport()); return response(result);
        });
    }
    @PostMapping
    ResponseEntity<Result> create(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request); var selected=policy.select(request); String csrf=csrf(request,selected);
        var input=ContactRequests.input(request,true); admit(selected,true);
        return transaction.execute(status -> {
            var scope=scope(selected,true,csrf); manage(scope);
            var created=contacts.create(scope.accountId(),scope.organizationId(),input.id(),input.values(),ContactRequests.digest(input.values(),creationKey));
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            return ResponseEntity.status(created.replay()?200:201).header("Location","/api/v1/organization/contacts/"+input.id()).body(response(created.contact()));
        });
    }
    @PutMapping("/{resourceId}")
    Result update(@PathVariable String resourceId,HttpServletRequest request) throws IOException {
        AuthController.noQuery(request); UUID id=ContactRequests.id(resourceId,"PATH","resourceId");
        var selected=policy.select(request); String csrf=csrf(request,selected); var input=ContactRequests.input(request,false); admit(selected,true);
        return transaction.execute(status -> {
            var scope=scope(selected,true,csrf); var current=contacts.read(scope.organizationId(),id); manage(scope);
            requireRevision(current,input.expectedRevision());
            var result=contacts.replace(scope.accountId(),scope.organizationId(),id,input.values());
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport()); return response(result);
        });
    }
    @PostMapping("/{resourceId}/archive")
    Result archive(@PathVariable String resourceId,HttpServletRequest request) throws IOException { return state(resourceId,request,true); }
    @PostMapping("/{resourceId}/restore")
    Result restore(@PathVariable String resourceId,HttpServletRequest request) throws IOException { return state(resourceId,request,false); }
    private Result state(String resourceId,HttpServletRequest request,boolean archived) throws IOException {
        AuthController.noQuery(request); UUID id=ContactRequests.id(resourceId,"PATH","resourceId");
        var selected=policy.select(request); String csrf=csrf(request,selected); String revision=ContactRequests.revisionCommand(request); admit(selected,true);
        return transaction.execute(status -> {
            var scope=scope(selected,true,csrf); var current=contacts.read(scope.organizationId(),id); manage(scope); requireRevision(current,revision);
            var result=contacts.state(scope.accountId(),scope.organizationId(),id,archived);
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport()); return response(result);
        });
    }
    private void requireRevision(BusinessContactRecord current,String revision) {
        if (!revisions.matches("contact/v1",current.id(),current.revision(),revision)) {
            throw new ContactFailure(ContactFailure.Reason.REVISION_CONFLICT,current.id(),current.revision());
        }
    }
    private BusinessScope scope(SessionTransportPolicy.Selected selected,boolean write,String csrf) {
        var principal=write?sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport()):sessions.authenticate(selected.secret(),selected.transport());
        if (write && selected.transport()==SessionTransport.BROWSER) { sessions.requireCsrf(selected.secret(),csrf); }
        var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(() -> new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE));
        return authorization.require(principal.accountId(),member.organizationId(),member.country(),
                BusinessCapability.READ_OWN_ORGANIZATION);
    }
    private void manage(BusinessScope scope) {
        authorization.require(scope.accountId(),scope.organizationId(),scope.country(),BusinessCapability.MANAGE_LOCATIONS_AND_CONTACTS);
    }
    private static String csrf(HttpServletRequest request,SessionTransportPolicy.Selected selected) {
        return selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null;
    }
    private void admit(SessionTransportPolicy.Selected selected,boolean write) {
        UUID account=transaction.execute(status -> sessions.authenticate(selected.secret(),selected.transport()).accountId()); throttle.admitApi(account,write);
    }
    private Result response(BusinessContactRecord c) {
        return new Result(c.id(),revisions.encode("contact/v1",c.id(),c.revision()),c.label(),c.contact(),c.state());
    }
    record Result(UUID id,String revision,String label,LocationRecord.Contact contact,String state) { }
    record Page(List<Result> items,int page,int size,Long total) { }
}
