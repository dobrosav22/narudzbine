package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.audit.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Clock;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name={"identity.http.enabled","audit.redaction-preview.enabled"},havingValue="true")
public final class RedactionPreviewController {
 private final RedactionPreviews previews;private final PrivateCaseReview reviews;private final SessionService sessions;private final SupportAccessService scopes;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx,snapshot;
 RedactionPreviewController(RedactionPreviews previews,PrivateCaseReview reviews,SessionService sessions,SupportAccessService scopes,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager){this.previews=previews;this.reviews=reviews;this.sessions=sessions;this.scopes=scopes;this.policy=policy;this.throttle=throttle;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);snapshot=new TransactionTemplate(manager);snapshot.setTimeout(10);snapshot.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);}
 @PostMapping("/api/v1/admin/privacy-cases/{caseId}/redaction-preview") ResponseEntity<RedactionPreviews.Preview> preview(@PathVariable String caseId,HttpServletRequest r)throws IOException{
  AuthController.noQuery(r);UUID id=ContactRequests.id(caseId,"PATH","caseId");
  if(r.getHeader("Idempotency-Key")!=null)throw new AuthHttpFailure(List.of(new AuthErrors.FieldError("HEADER","Idempotency-Key","INVALID_VALUE")));
  var body=AuthRequests.object(r,Set.of("reason","caseReference"));var errors=new ArrayList<AuthErrors.FieldError>();String reason=OrganizationRequests.text(body,"reason","",1000,false,errors),reference=OrganizationRequests.text(body,"caseReference","",100,false,errors);if(!errors.isEmpty())throw new AuthHttpFailure(errors);
  var context=new PrivateCaseReview.Context(reason,reference);var selected=policy.select(r);String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;
  UUID actor=tx.execute(s->{UUID idActor=sessions.replayAdmissionAccount(selected.secret(),selected.transport());if(!scopes.platformAccount(idActor))throw new PrivacyFailure("NOT_FOUND");reviews.qualify(idActor);return idActor;});throttle.admitApi(actor,true);
  var access=tx.execute(s->{var target=route(id);var principal=authenticate(selected,csrf);return reviews.authorize(id,target,new PrivateCaseReview.Actor(principal.accountId(),principal.sessionId(),selected.transport().name()),context);});
  var result=snapshot.execute(s->{route(id);var principal=authenticate(selected,csrf);if(!principal.accountId().equals(access.actor().account())||!principal.sessionId().equals(access.actor().session()))throw new PrivacyFailure("NOT_FOUND");var value=previews.inspect(access);fresh(principal);sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return value;});
  return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Pragma","no-cache").body(result);
 }
 private PrivateCaseReview.Target route(UUID id){var target=reviews.route(id).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));var locked=scopes.lock(target.organization(),Set.of()).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));if(!locked.country().equals(target.country()))throw new PrivacyFailure("NOT_FOUND");return target;}
 private AuthenticatedSession authenticate(SessionTransportPolicy.Selected selected,String csrf){var principal=sessions.authenticateForProfileWrite(selected.secret(),selected.transport());if(!principal.platformAdministrator())throw new PrivacyFailure("NOT_FOUND");if(selected.transport()==SessionTransport.BROWSER)sessions.requireCsrf(selected.secret(),csrf);reviews.qualify(principal.accountId());fresh(principal);return principal;}
 private void fresh(AuthenticatedSession p){var at=clock.instant();if(at.isBefore(p.authenticatedAt())||!at.isBefore(p.authenticatedAt().plusSeconds(300)))throw new AuthHttpFailure(403,"REAUTHENTICATION_REQUIRED");}
}
