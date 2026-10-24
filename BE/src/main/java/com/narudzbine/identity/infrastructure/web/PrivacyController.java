package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.audit.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class PrivacyController {
    private final PrivacyCases cases;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;
    private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final TransactionTemplate tx;
    PrivacyController(PrivacyCases cases,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,PlatformTransactionManager manager){this.cases=cases;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
    @PostMapping("/api/v1/organization/privacy-cases") ResponseEntity<PrivacyCases.View> create(HttpServletRequest r)throws IOException {
        AuthController.noQuery(r);var command=command(r);var selected=policy.select(r);String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;admit(selected,true);
        var result=tx.execute(status->{var scope=scope(selected);if(selected.transport()==SessionTransport.BROWSER)sessions.requireCsrf(selected.secret(),csrf);var v=cases.create(scope,command);activity(selected);return v;});
        return ResponseEntity.created(java.net.URI.create("/api/v1/organization/privacy-cases/"+result.id())).body(result);
    }
    @GetMapping("/api/v1/organization/privacy-cases/{caseId}") PrivacyCases.View read(@PathVariable String caseId,HttpServletRequest r){
        AuthController.noQuery(r);AuthController.noBody(r);UUID id=ContactRequests.id(caseId,"PATH","caseId");var selected=policy.select(r);admit(selected,false);
        return tx.execute(status->{var result=cases.read(scope(selected),id);activity(selected);return result;});
    }
    @GetMapping("/api/v1/admin/privacy-cases/{caseId}") PrivacyCases.View administrative(@PathVariable String caseId,HttpServletRequest r){
        AuthController.noQuery(r);AuthController.noBody(r);UUID id=ContactRequests.id(caseId,"PATH","caseId");var selected=policy.select(r);admit(selected,false);
        return tx.execute(status->{var p=sessions.authenticateForProfileWrite(selected.secret(),selected.transport());if(!p.platformAdministrator())throw new PrivacyFailure("NOT_FOUND");var result=cases.administrative(p.accountId(),id);activity(selected);return result;});
    }
    private PrivacyCases.Scope scope(SessionTransportPolicy.Selected selected){
        var principal=sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport());
        var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));
        var own=authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.READ_ORGANIZATION_AUDIT);
        return new PrivacyCases.Scope(own.accountId(),own.organizationId(),own.country().name());
    }
    private void admit(SessionTransportPolicy.Selected s,boolean write){var actor=tx.execute(status->sessions.replayAdmissionAccount(s.secret(),s.transport()));throttle.admitApi(actor,write);}
    private void activity(SessionTransportPolicy.Selected s){sessions.recordSuccessfulActivity(s.secret(),s.transport());}
    private static PrivacyCases.Command command(HttpServletRequest r)throws IOException {
        var b=AuthRequests.object(r,Set.of("id","kind","reason"));var errors=new ArrayList<AuthErrors.FieldError>();UUID id=null;
        try{id=ContactRequests.id(b.path("id").isString()?b.path("id").asString():null,"BODY","/id");}catch(AuthHttpFailure f){errors.addAll(f.fields);}
        String kind=b.path("kind").isString()?b.path("kind").asString():"";if(!Set.of("EXPORT","REDACTION").contains(kind))errors.add(new AuthErrors.FieldError("/kind","INVALID_VALUE"));
        String reason=OrganizationRequests.text(b,"reason","",1000,false,errors);
        if(!errors.isEmpty())throw new AuthHttpFailure(errors);return new PrivacyCases.Command(id,kind,reason);
    }
}
