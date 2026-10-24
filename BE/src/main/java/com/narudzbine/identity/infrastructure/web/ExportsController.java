package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.reporting.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Clock;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/exports")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class ExportsController {
    private final Exports exports;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;
    private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx;
    ExportsController(Exports exports,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager){
        this.exports=exports;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);
    }
    @PostMapping ResponseEntity<Exports.View> create(HttpServletRequest r)throws IOException{
        AuthController.noQuery(r);var command=ExportRequests.parse(r);var selected=policy.select(r);String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;admit(selected,true);
        var result=tx.execute(status->{var scope=scope(selected,csrf,true);if(command.kind().equals("REPORT_BUYERS")&&!scope.vendor())throw new ExportFailure("NOT_FOUND");ExportRequests.current(command,scope.country(),clock.instant());var v=exports.create(scope,command);activity(selected);return v;});
        return ResponseEntity.accepted().location(java.net.URI.create("/api/v1/exports/"+result.id())).body(result);
    }
    @GetMapping("/{exportId}") Exports.View get(@PathVariable String exportId,HttpServletRequest r){
        AuthController.noQuery(r);AuthController.noBody(r);UUID id=ContactRequests.id(exportId,"PATH","exportId");var selected=policy.select(r);admit(selected,false);
        return tx.execute(status->{var result=exports.read(scope(selected,null,false),id);activity(selected);return result;});
    }
    @GetMapping("/{exportId}/content") ResponseEntity<byte[]> download(@PathVariable String exportId,HttpServletRequest r){
        AuthController.noQuery(r);AuthController.noBody(r);UUID id=ContactRequests.id(exportId,"PATH","exportId");var selected=policy.select(r);admit(selected,false);
        var result=tx.execute(status->{var content=exports.download(scope(selected,null,false),id);if(content.failureCode()==null)activity(selected);return content;});
        // Expiry cleanup commits before reporting the non-downloadable state.
        if(result.failureCode()!=null)throw new ExportFailure(result.failureCode());
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv;charset=UTF-8")).contentLength(result.bytes().length)
                .header("Content-Disposition","attachment; filename=\"export-"+id+".csv\"").header("Cache-Control","private, no-store").header("X-Content-Type-Options","nosniff").body(result.bytes());
    }
    private Exports.Scope scope(SessionTransportPolicy.Selected s,String csrf,boolean write){
        var p=sessions.authenticateForOrganizationWrite(s.secret(),s.transport());if(write&&s.transport()==SessionTransport.BROWSER)sessions.requireCsrf(s.secret(),csrf);
        var m=memberships.lockForAuthorization(p.accountId()).orElseThrow(()->new ExportFailure("NOT_FOUND"));
        var own=authorization.require(p.accountId(),m.organizationId(),m.country(),BusinessCapability.READ_OWN_ORGANIZATION);
        return new Exports.Scope(own.accountId(),own.organizationId(),own.country().name(),own.organizationType()==OrganizationType.VENDOR);
    }
    private void admit(SessionTransportPolicy.Selected s,boolean write){var id=tx.execute(status->sessions.replayAdmissionAccount(s.secret(),s.transport()));throttle.admitApi(id,write);}
    private void activity(SessionTransportPolicy.Selected s){sessions.recordSuccessfulActivity(s.secret(),s.transport());}
}
