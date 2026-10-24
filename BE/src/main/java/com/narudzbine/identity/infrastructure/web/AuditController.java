package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.audit.api.AuditReads;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class AuditController {
    private final AuditReads reads;private final AuditCursors cursors;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;
    private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx;
    AuditController(AuditReads reads,AuditCursors cursors,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager){this.reads=reads;this.cursors=cursors;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
    @GetMapping("/api/v1/organization/audit") Page organization(HttpServletRequest r){return read(r,false);}
    @GetMapping("/api/v1/admin/audit") Page platform(HttpServletRequest r){return read(r,true);}
    private Page read(HttpServletRequest r,boolean platform){
        AuthController.noBody(r);var q=query(r,platform);var selected=policy.select(r);var actor=tx.execute(status->sessions.replayAdmissionAccount(selected.secret(),selected.transport()));throttle.admitApi(actor,false);
        return tx.execute(status->{
            var principal=platform?sessions.authenticateForProfileWrite(selected.secret(),selected.transport()):sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport());
            UUID org=null;String country=null;
            if(platform){if(!principal.platformAdministrator())throw new AuthHttpFailure(404,"NOT_FOUND");}
            else{var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new AuthHttpFailure(404,"NOT_FOUND"));var own=authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.READ_ORGANIZATION_AUDIT);org=own.organizationId();country=own.country().name();}
            var scope=new AuditCursors.Scope(platform?"PLATFORM":"ORGANIZATION",principal.accountId(),org,country,q.organization(),q.action(),q.size());
            var after=q.cursor()==null?null:cursors.decode(q.cursor(),scope);
            var rows=platform?reads.platform(q.organization(),q.action(),q.size(),after==null?null:after.at(),after==null?null:after.id()):reads.organization(org,country,q.action(),q.size(),after==null?null:after.at(),after==null?null:after.id());
            String next=null;if(rows.more()){var last=rows.items().getLast();next=cursors.encode(scope,new AuditCursors.Position(last.createdAt(),last.id(),after==null?clock.instant().truncatedTo(ChronoUnit.MILLIS).plusSeconds(86400):after.expires()));}
            var result=new Page(rows.items().stream().map(AuditController::event).toList(),next);sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return result;
        });
    }
    private static Query query(HttpServletRequest r,boolean platform){
        var allowed=platform?Set.of("size","cursor","action","organizationId"):Set.of("size","cursor","action");
        for(var e:r.getParameterMap().entrySet())if(!allowed.contains(e.getKey())||e.getValue().length!=1)throw StockRequests.invalid(e.getKey());
        int size=25;String v=r.getParameter("size");if(v!=null){try{if(!v.matches("[1-9][0-9]{0,2}"))throw new IllegalArgumentException();size=Integer.parseInt(v);if(size>100)throw new IllegalArgumentException();}catch(IllegalArgumentException e){throw StockRequests.invalid("size");}}
        String action=r.getParameter("action"),cursor=r.getParameter("cursor");if(action!=null&&!action.matches("[A-Z][A-Z0-9_]{0,79}"))throw StockRequests.invalid("action");if(cursor!=null&&(cursor.isBlank()||cursor.length()>2048))throw StockRequests.invalid("cursor");
        UUID organization=r.getParameter("organizationId")==null?null:ContactRequests.id(r.getParameter("organizationId"),"QUERY","organizationId");return new Query(size,action,cursor,organization);
    }
    private static Event event(AuditReads.Event e){return new Event(e.id(),e.actorAccountId(),e.action(),e.resourceId(),e.requestId(),e.reason(),e.changedFields(),AccountResponses.time(e.createdAt()));}
    private record Query(int size,String action,String cursor,UUID organization){}
    record Event(UUID id,UUID actorAccountId,String action,UUID resourceId,UUID requestId,String reason,List<String> changedFields,String createdAt){}
    record Page(List<Event> items,String nextCursor){}
}
