package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.audit.api.*;
import com.narudzbine.reporting.api.PortableExports;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Clock;
import java.util.*;
import java.util.concurrent.Semaphore;
import java.util.function.Function;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name={"identity.http.enabled","privacy.exports.enabled"},havingValue="true")
public final class PortableExportsController {
 private final PortableExports exports;private final PrivateCaseReview operators;private final SessionService sessions;
 private final SupportAccessService scopes;private final MembershipAccess memberships;private final BusinessAuthorization authorization;
 private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx;
 private final Semaphore downloads=new Semaphore(2);
 PortableExportsController(PortableExports exports,PrivateCaseReview operators,SessionService sessions,SupportAccessService scopes,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager){this.exports=exports;this.operators=operators;this.sessions=sessions;this.scopes=scopes;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @PostMapping("/api/v1/admin/privacy-cases/{caseId}/exports") ResponseEntity<PortableExports.View> approve(@PathVariable String caseId,HttpServletRequest r)throws IOException{
  strict(r);UUID source=id(caseId,"caseId");var b=AuthRequests.object(r,Set.of("id","expectedCaseRevision","reason","caseReference"));var errors=new ArrayList<AuthErrors.FieldError>();
  String selected=OrganizationRequests.text(b,"id","",36,false,errors),expected=OrganizationRequests.text(b,"expectedCaseRevision","",128,false,errors);
  var context=new PortableExports.Context(OrganizationRequests.text(b,"reason","",1000,false,errors),OrganizationRequests.text(b,"caseReference","",100,false,errors));if(!errors.isEmpty())throw new AuthHttpFailure(errors);UUID job=ContactRequests.id(selected,"BODY","/id");
  var result=admin(r,source,true,actor->exports.approve(actor,source,job,expected,context));
  return response(201).header(HttpHeaders.LOCATION,"/api/v1/admin/privacy-cases/"+source+"/exports/"+job).body(result);
 }
 @GetMapping("/api/v1/admin/privacy-cases/{caseId}/export") ResponseEntity<PortableExports.View> adminLatest(@PathVariable String caseId,HttpServletRequest r){return adminRead(caseId,null,r);}
 @GetMapping("/api/v1/admin/privacy-cases/{caseId}/exports/{exportId}") ResponseEntity<PortableExports.View> adminRead(@PathVariable String caseId,@PathVariable String exportId,HttpServletRequest r){strict(r);AuthController.noBody(r);UUID source=id(caseId,"caseId"),job=exportId==null?null:id(exportId,"exportId");return response(200).body(admin(r,source,false,a->exports.administrative(a,source,job)));}
 @GetMapping("/api/v1/organization/privacy-cases/{caseId}/export") ResponseEntity<PortableExports.View> ownLatest(@PathVariable String caseId,HttpServletRequest r){return ownRead(caseId,null,r);}
 @GetMapping("/api/v1/organization/privacy-cases/{caseId}/exports/{exportId}") ResponseEntity<PortableExports.View> ownRead(@PathVariable String caseId,@PathVariable String exportId,HttpServletRequest r){strict(r);AuthController.noBody(r);UUID source=id(caseId,"caseId"),job=exportId==null?null:id(exportId,"exportId");return response(200).body(own(r,s->exports.status(s,source,job)));}
 @GetMapping("/api/v1/organization/privacy-cases/{caseId}/exports/{exportId}/content") ResponseEntity<byte[]> content(@PathVariable String caseId,@PathVariable String exportId,HttpServletRequest r){
  strict(r);AuthController.noBody(r);UUID source=id(caseId,"caseId"),job=id(exportId,"exportId");if(!downloads.tryAcquire())throw new PrivacyFailure("SERVICE_UNAVAILABLE");
  try{var result=own(r,s->exports.content(s,source,job));if(result.failureCode()!=null)throw new PrivacyFailure(result.failureCode());return response(200).contentType(MediaType.APPLICATION_JSON).header("X-Content-Type-Options","nosniff").header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"privacy-export-"+job+".json\"").body(result.bytes());}finally{downloads.release();}
 }
 private <T>T admin(HttpServletRequest r,UUID source,boolean write,Function<PrivateCaseReview.Actor,T> action){
  var selected=policy.select(r);String csrf=write&&selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;
  UUID actor=tx.execute(s->{UUID value=sessions.replayAdmissionAccount(selected.secret(),selected.transport());if(!scopes.platformAccount(value))throw new PrivacyFailure("NOT_FOUND");operators.qualify(value);return value;});throttle.admitApi(actor,write);
  return tx.execute(s->{var target=operators.route(source).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));var locked=scopes.lock(target.organization(),Set.of()).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));if(!locked.country().equals(target.country()))throw new PrivacyFailure("NOT_FOUND");var principal=sessions.authenticateForProfileWrite(selected.secret(),selected.transport());if(!principal.platformAdministrator())throw new PrivacyFailure("NOT_FOUND");if(write&&selected.transport()==SessionTransport.BROWSER)sessions.requireCsrf(selected.secret(),csrf);operators.qualify(principal.accountId());fresh(principal);T value=action.apply(new PrivateCaseReview.Actor(principal.accountId(),principal.sessionId(),selected.transport().name()));fresh(principal);sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return value;});
 }
 private <T>T own(HttpServletRequest r,Function<PortableExports.Scope,T> action){
  var selected=policy.select(r);UUID actor=tx.execute(s->sessions.replayAdmissionAccount(selected.secret(),selected.transport()));throttle.admitApi(actor,false);
  return tx.execute(s->{var principal=sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport());var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));var own=authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.READ_ORGANIZATION_AUDIT);fresh(principal);T value=action.apply(new PortableExports.Scope(own.accountId(),principal.sessionId(),selected.transport().name(),own.organizationId(),own.country().name()));fresh(principal);sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return value;});
 }
 private void fresh(AuthenticatedSession p){var at=clock.instant();if(at.isBefore(p.authenticatedAt())||!at.isBefore(p.authenticatedAt().plusSeconds(300)))throw new AuthHttpFailure(403,"REAUTHENTICATION_REQUIRED");}
 private static UUID id(String value,String name){return ContactRequests.id(value,"PATH",name);}
 private static void strict(HttpServletRequest r){AuthController.noQuery(r);if(r.getHeader("Idempotency-Key")!=null)throw new AuthHttpFailure(List.of(new AuthErrors.FieldError("HEADER","Idempotency-Key","INVALID_VALUE")));}
 private static ResponseEntity.BodyBuilder response(int status){return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header("Pragma","no-cache");}
}
