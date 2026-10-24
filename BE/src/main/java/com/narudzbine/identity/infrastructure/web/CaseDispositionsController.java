package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.audit.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Clock;
import java.util.*;
import java.util.function.Function;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
@RestController
@ConditionalOnProperty(name={"identity.http.enabled","audit.case-dispositions.enabled"},havingValue="true")
public final class CaseDispositionsController {
 private final CaseDispositions redactions;private final PrivateCaseReview reviews;private final SessionService sessions;private final SupportAccessService scopes;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx;
 CaseDispositionsController(CaseDispositions redactions,PrivateCaseReview reviews,SessionService sessions,SupportAccessService scopes,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager){this.redactions=redactions;this.reviews=reviews;this.sessions=sessions;this.scopes=scopes;this.policy=policy;this.throttle=throttle;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);}
 @PostMapping("/api/v1/admin/privacy-cases/{caseId}/dispositions") ResponseEntity<CaseDispositions.View> record(@PathVariable String caseId,HttpServletRequest r)throws IOException{
  strict(r);UUID source=id(caseId,"caseId");var b=AuthRequests.object(r,Set.of("id","expectedCaseRevision","items","resolveCase","acceptRetainedScope","reason","caseReference","requesterVerificationReference","legalApplicabilityReference","containmentReference","retainedScopeReference"));var errors=new ArrayList<AuthErrors.FieldError>();
  String requested=OrganizationRequests.text(b,"id","",36,false,errors),expected=OrganizationRequests.text(b,"expectedCaseRevision","",128,false,errors);var context=context(b,errors);var refs=new ScopedRedactions.References(reference(b,"requesterVerificationReference",errors),reference(b,"legalApplicabilityReference",errors),reference(b,"containmentReference",errors),reference(b,"retainedScopeReference",errors));
  for(String flag:List.of("resolveCase","acceptRetainedScope"))if(!b.path(flag).isBoolean())errors.add(new AuthErrors.FieldError("BODY","/"+flag,"INVALID_VALUE"));
  var items=new ArrayList<CaseDispositions.Item>();var seen=new HashSet<String>();var array=b.path("items");if(!array.isArray()||array.size()!=10)errors.add(new AuthErrors.FieldError("BODY","/items","INVALID_VALUE"));
  else for(int i=0;i<array.size();i++){
   var item=array.get(i);String prefix="/items/"+i;if(!item.isObject()||item.size()!=4||!item.has("family")||!item.has("disposition")||!item.has("jobId")||!item.has("reference")){errors.add(new AuthErrors.FieldError("BODY",prefix,"INVALID_VALUE"));continue;}
   String family=OrganizationRequests.text(item,"family",prefix,40,false,errors),decision=OrganizationRequests.text(item,"disposition",prefix,40,false,errors),ref=OrganizationRequests.text(item,"reference",prefix,100,false,errors);UUID job=null;
   if(!CaseDispositions.FAMILIES.contains(family)||!seen.add(family))errors.add(new AuthErrors.FieldError("BODY",prefix+"/family","INVALID_VALUE"));
   if(!Set.of("APPLIED","RETAINED","PENDING","REVIEWED_NO_ADDITIONAL_SCOPE").contains(decision))errors.add(new AuthErrors.FieldError("BODY",prefix+"/disposition","INVALID_VALUE"));
   if(!ref.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}"))errors.add(new AuthErrors.FieldError("BODY",prefix+"/reference","INVALID_VALUE"));
   if(!item.path("jobId").isNull()){if(!item.path("jobId").isString())errors.add(new AuthErrors.FieldError("BODY",prefix+"/jobId","INVALID_VALUE"));else job=ContactRequests.id(item.path("jobId").asString(),"BODY",prefix+"/jobId");}
   items.add(new CaseDispositions.Item(family,decision,job,ref));
  }
  if(!errors.isEmpty())throw new AuthHttpFailure(errors);var command=new CaseDispositions.Command(ContactRequests.id(requested,"BODY","/id"),expected,items,b.path("resolveCase").asBoolean(),b.path("acceptRetainedScope").asBoolean(),refs,context);var call=authorize(r,source,context);var result=finish(source,call,a->redactions.record(a,command));return response(201).header(HttpHeaders.LOCATION,"/api/v1/admin/privacy-cases/"+source+"/dispositions/"+result.id()).body(result);
 }
 @GetMapping("/api/v1/admin/privacy-cases/{caseId}/dispositions/{dispositionId}") ResponseEntity<CaseDispositions.View> read(@PathVariable String caseId,@PathVariable String dispositionId,HttpServletRequest r){
  strict(r);AuthController.noBody(r);UUID source=id(caseId,"caseId"),selectedId=id(dispositionId,"dispositionId");var selected=policy.select(r);admit(selected,false);var result=tx.execute(s->{route(source);var principal=authenticate(selected,null,false);var value=redactions.read(new PrivateCaseReview.Actor(principal.accountId(),principal.sessionId(),selected.transport().name()),source,selectedId);fresh(principal);sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return value;});return response(200).body(result);
 }
 private Call authorize(HttpServletRequest r,UUID source,PrivateCaseReview.Context context){var selected=policy.select(r);String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;admit(selected,true);var access=tx.execute(s->{var target=route(source);var principal=authenticate(selected,csrf,true);return reviews.authorize(source,target,new PrivateCaseReview.Actor(principal.accountId(),principal.sessionId(),selected.transport().name()),context);});return new Call(selected,csrf,access);}
 private CaseDispositions.View finish(UUID source,Call call,Function<PrivateCaseReview.Access,CaseDispositions.View> action){return tx.execute(s->{route(source);var principal=authenticate(call.selected(),call.csrf(),true);if(!principal.accountId().equals(call.access().actor().account())||!principal.sessionId().equals(call.access().actor().session()))throw new PrivacyFailure("NOT_FOUND");var value=action.apply(call.access());fresh(principal);sessions.recordSuccessfulActivity(call.selected().secret(),call.selected().transport());return value;});}
 private void admit(SessionTransportPolicy.Selected selected,boolean write){UUID actor=tx.execute(s->{UUID value=sessions.replayAdmissionAccount(selected.secret(),selected.transport());if(!scopes.platformAccount(value))throw new PrivacyFailure("NOT_FOUND");reviews.qualify(value);return value;});throttle.admitApi(actor,write);}
 private PrivateCaseReview.Target route(UUID source){var target=reviews.route(source).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));var locked=scopes.lock(target.organization(),Set.of()).orElseThrow(()->new PrivacyFailure("NOT_FOUND"));if(!locked.country().equals(target.country()))throw new PrivacyFailure("NOT_FOUND");return target;}
 private AuthenticatedSession authenticate(SessionTransportPolicy.Selected selected,String csrf,boolean write){var p=sessions.authenticateForProfileWrite(selected.secret(),selected.transport());if(!p.platformAdministrator())throw new PrivacyFailure("NOT_FOUND");if(write&&selected.transport()==SessionTransport.BROWSER)sessions.requireCsrf(selected.secret(),csrf);reviews.qualify(p.accountId());fresh(p);return p;}
 private void fresh(AuthenticatedSession p){var at=clock.instant();if(at.isBefore(p.authenticatedAt())||!at.isBefore(p.authenticatedAt().plusSeconds(300)))throw new AuthHttpFailure(403,"REAUTHENTICATION_REQUIRED");}
 private static PrivateCaseReview.Context context(tools.jackson.databind.JsonNode b,List<AuthErrors.FieldError> errors){return new PrivateCaseReview.Context(OrganizationRequests.text(b,"reason","",1000,false,errors),OrganizationRequests.text(b,"caseReference","",100,false,errors));}
 private static String reference(tools.jackson.databind.JsonNode b,String name,List<AuthErrors.FieldError> errors){String value=OrganizationRequests.text(b,name,"",100,false,errors);if(!value.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}"))errors.add(new AuthErrors.FieldError("BODY","/"+name,"INVALID_VALUE"));return value;}
 private static UUID id(String value,String name){return ContactRequests.id(value,"PATH",name);}
 private static void strict(HttpServletRequest r){AuthController.noQuery(r);if(r.getHeader("Idempotency-Key")!=null)throw new AuthHttpFailure(List.of(new AuthErrors.FieldError("HEADER","Idempotency-Key","INVALID_VALUE")));}
 private static ResponseEntity.BodyBuilder response(int status){return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header("Pragma","no-cache");}
 private record Call(SessionTransportPolicy.Selected selected,String csrf,PrivateCaseReview.Access access){}
}
