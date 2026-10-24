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
@RequestMapping("/api/v1/organization/locations")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class LocationController {
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final BusinessAuthorization authorization;
    private final Locations locations;
    private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;
    private final ResourceRevisions revisions;
    private final TransactionTemplate transaction;
    LocationController(SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,
            Locations locations,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,PlatformTransactionManager manager) {
        this.sessions=sessions; this.memberships=memberships; this.authorization=authorization; this.locations=locations;
        this.policy=policy; this.throttle=throttle; this.revisions=revisions;
        transaction=new TransactionTemplate(manager); transaction.setTimeout(10);
    }
    @GetMapping
    Page list(HttpServletRequest request) {
        AuthController.noBody(request); var query=LocationRequests.query(request); var selected=policy.select(request); admit(selected,false);
        return transaction.execute(status -> {
            var scope=scope(selected,false,null);
            var page=locations.list(scope.organizationId(),query.page(),query.size(),query.state(),query.total());
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            return new Page(page.items().stream().map(this::response).toList(),query.page(),query.size(),page.total());
        });
    }
    @GetMapping("/{resourceId}")
    Result get(@PathVariable String resourceId,HttpServletRequest request) {
        AuthController.noQuery(request); AuthController.noBody(request);
        UUID id=LocationRequests.id(resourceId,"PATH","resourceId"); var selected=policy.select(request); admit(selected,false);
        return transaction.execute(status -> {
            var scope=scope(selected,false,null); var result=locations.read(scope.organizationId(),id);
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport()); return response(result);
        });
    }
    @PostMapping
    ResponseEntity<Result> create(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request); var selected=policy.select(request); String csrf=csrf(request,selected);
        var input=LocationRequests.input(request,true); admit(selected,true);
        return transaction.execute(status -> {
            var scope=scope(selected,true,csrf); manage(scope); validate(scope,input.values());
            var created=locations.create(scope.accountId(),scope.organizationId(),input.id(),input.values(),LocationRequests.digest(input.values()));
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            return ResponseEntity.status(created.replay()?200:201).header("Location","/api/v1/organization/locations/"+input.id()).body(response(created.location()));
        });
    }
    @PutMapping("/{resourceId}")
    Result update(@PathVariable String resourceId,HttpServletRequest request) throws IOException {
        AuthController.noQuery(request); UUID id=LocationRequests.id(resourceId,"PATH","resourceId");
        var selected=policy.select(request); String csrf=csrf(request,selected); var input=LocationRequests.input(request,false); admit(selected,true);
        return transaction.execute(status -> {
            var scope=scope(selected,true,csrf); var current=locations.read(scope.organizationId(),id); manage(scope);
            requireRevision(current,input.expectedRevision()); validate(scope,input.values());
            var result=locations.replace(scope.accountId(),scope.organizationId(),id,input.values());
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport()); return response(result);
        });
    }
    @PostMapping("/{resourceId}/archive")
    Result archive(@PathVariable String resourceId,HttpServletRequest request) throws IOException { return state(resourceId,request,true); }
    @PostMapping("/{resourceId}/restore")
    Result restore(@PathVariable String resourceId,HttpServletRequest request) throws IOException { return state(resourceId,request,false); }
    private Result state(String resourceId,HttpServletRequest request,boolean archived) throws IOException {
        AuthController.noQuery(request); UUID id=LocationRequests.id(resourceId,"PATH","resourceId");
        var selected=policy.select(request); String csrf=csrf(request,selected); String revision=LocationRequests.revisionCommand(request); admit(selected,true);
        return transaction.execute(status -> {
            var scope=scope(selected,true,csrf); var current=locations.read(scope.organizationId(),id); manage(scope); requireRevision(current,revision);
            var result=locations.state(scope.accountId(),scope.organizationId(),id,archived);
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport()); return response(result);
        });
    }
    private void requireRevision(LocationRecord current,String revision) {
        if (!revisions.matches("location/v1",current.id(),current.revision(),revision)) {
            throw new LocationFailure(LocationFailure.Reason.REVISION_CONFLICT,current.id(),current.revision());
        }
    }
    private static void validate(BusinessScope scope,LocationRecord.Values values) {
        if (values.address().country()!=scope.country()) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/address/country"); }
        if (scope.organizationType()==OrganizationType.BUYER && values.contact()==null) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/contact"); }
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
    private Result response(LocationRecord l) {
        return new Result(l.id(),revisions.encode("location/v1",l.id(),l.revision()),l.name(),l.address(),l.contact(),l.instructions(),l.state(),
                AccountResponses.time(l.createdAt()),AccountResponses.time(l.updatedAt()));
    }
    record Result(UUID id,String revision,String name,OrganizationRecord.Address address,LocationRecord.Contact contact,String instructions,
            String state,String createdAt,String updatedAt) { }
    record Page(List<Result> items,int page,int size,Long total) { }
}
