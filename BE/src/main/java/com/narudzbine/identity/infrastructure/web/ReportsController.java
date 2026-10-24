package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.reporting.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.Semaphore;
import java.util.function.BiFunction;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/reports")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class ReportsController {
    private final BusinessReports reports;
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final BusinessAuthorization authorization;
    private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;
    private final Clock clock;
    private final TransactionTemplate authority, snapshot;
    // One snapshot at a time; authority transactions finish before the read and are repeated before publication.
    private final Semaphore admission=new Semaphore(1);
    ReportsController(BusinessReports reports,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,
            SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager) {
        this.reports=reports;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;
        this.policy=policy;this.throttle=throttle;this.clock=clock;
        authority=new TransactionTemplate(manager);authority.setTimeout(30);
        snapshot=new TransactionTemplate(manager);snapshot.setTimeout(25);snapshot.setReadOnly(true);
        snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);snapshot.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    @GetMapping("/summary") BusinessReports.Summary summary(HttpServletRequest r) {
        var q=query(r,true);return read(r,q,false,(s,range)->reports.summary(s,range,q.grouping()));
    }
    @GetMapping("/products") BusinessReports.Page<BusinessReports.Product> products(HttpServletRequest r) {
        var q=query(r,false);return read(r,q,false,(s,range)->reports.products(s,range,q.page(),q.size(),q.total()));
    }
    @GetMapping("/buyers") BusinessReports.Page<BusinessReports.Buyer> buyers(HttpServletRequest r) {
        var q=query(r,false);return read(r,q,true,(s,range)->reports.buyers(s,range,q.page(),q.size(),q.total()));
    }
    private ReportRequests.Query query(HttpServletRequest r,boolean summary){AuthController.noBody(r);return ReportRequests.parse(r,summary);}
    private <T> T read(HttpServletRequest r,ReportRequests.Query q,boolean vendorOnly,BiFunction<BusinessReports.Scope,BusinessReports.Range,T> action) {
        var selected=policy.select(r);
        var account=authority.execute(status->sessions.replayAdmissionAccount(selected.secret(),selected.transport()));
        throttle.admitApi(account,false);
        if(!admission.tryAcquire())throw new AuthHttpFailure(503,"SERVICE_UNAVAILABLE");
        try {
            var scope=authority.execute(status->scope(selected,vendorOnly));
            T result=snapshot.execute(read->{var range=q.range(scope.country(),clock.instant().truncatedTo(ChronoUnit.MILLIS));return action.apply(scope,range);});
            return authority.execute(status->{
                if(!scope.equals(scope(selected,vendorOnly)))throw new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
                sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return result;
            });
        } catch(ReportOverflow overflow){throw new AuthHttpFailure(422,"REPORT_OVERFLOW");}
        finally {admission.release();}
    }
    private BusinessReports.Scope scope(SessionTransportPolicy.Selected selected,boolean vendorOnly) {
        var principal=sessions.authenticateForOrganizationRead(selected.secret(),selected.transport());
        var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE));
        var own=authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.READ_OWN_ORGANIZATION);
        if(vendorOnly&&own.organizationType()!=OrganizationType.VENDOR)throw new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
        return new BusinessReports.Scope(own.organizationId(),own.country().name(),own.organizationType()==OrganizationType.VENDOR);
    }
}
