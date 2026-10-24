package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.identity.application.PlanSessionService;
import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.subscriptions.api.VendorPlans;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name={"identity.http.enabled","identity.setup.http.enabled"},havingValue="true")
public class PlanController {
 private final PlanSessionService service;private final SessionTransportPolicy policy;private final ResourceRevisions revisions;
 PlanController(PlanSessionService service,SessionTransportPolicy policy,ResourceRevisions revisions){this.service=service;this.policy=policy;this.revisions=revisions;}
 @GetMapping("/plans") Page<VendorPlans.Plan> plans(HttpServletRequest r){AuthController.noBody(r);var q=query(r,"includeRetired");var s=policy.select(r);var p=service.definitions(s.secret(),s.transport(),q.page(),q.size(),bool(r,"includeRetired"),q.total());return new Page<>(p.items(),q.page(),q.size(),p.total());}
 @GetMapping("/organization/plan") Assignment current(HttpServletRequest r){return current(r,null);}
 @GetMapping("/admin/vendors/{vendorId}/plan") Assignment adminCurrent(@PathVariable String vendorId,HttpServletRequest r){return current(r,ContactRequests.id(vendorId,"PATH","vendorId"));}
 private Assignment current(HttpServletRequest r,UUID vendor){AuthController.noQuery(r);AuthController.noBody(r);var s=policy.select(r);return assignment(service.current(s.secret(),s.transport(),vendor));}
 @PostMapping("/organization/plan-requests") ResponseEntity<Request> create(HttpServletRequest r)throws IOException{AuthController.noQuery(r);var s=policy.select(r);var b=AuthRequests.object(r,Set.of("planRevisionId"));var result=service.create(s.secret(),s.transport(),csrf(r,s),id(b,"planRevisionId"));return ResponseEntity.status(201).header("Location","/api/v1/organization/plan-requests/"+result.id()).body(request(result));}
 @GetMapping("/organization/plan-requests") Page<Request> list(HttpServletRequest r){return list(r,false);}
 @GetMapping("/admin/plan-requests") Page<Request> adminList(HttpServletRequest r){return list(r,true);}
 private Page<Request> list(HttpServletRequest r,boolean admin){AuthController.noBody(r);var q=query(r,"state");String state=r.getParameter("state");if(state!=null&&!Set.of("PENDING","APPROVED","REJECTED","WITHDRAWN","SUPERSEDED").contains(state)){throw invalidQuery("state");}var s=policy.select(r);var result=service.list(s.secret(),s.transport(),admin,q.page(),q.size(),state,q.total());return new Page<>(result.items().stream().map(this::request).toList(),q.page(),q.size(),result.total());}
 @DeleteMapping("/organization/plan-requests/{requestId}") ResponseEntity<Void> withdraw(@PathVariable String requestId,HttpServletRequest r){AuthController.noBody(r);if(r.getParameterMap().size()!=1||r.getParameterValues("expectedRevision")==null||r.getParameterValues("expectedRevision").length!=1){throw invalidQuery("expectedRevision");}String expected=r.getParameter("expectedRevision");if(expected.isBlank()||expected.length()>256){throw invalidQuery("expectedRevision");}var s=policy.select(r);service.withdraw(s.secret(),s.transport(),csrf(r,s),ContactRequests.id(requestId,"PATH","requestId"),expected);return ResponseEntity.noContent().build();}
 @PutMapping("/admin/vendors/{vendorId}/plan") Assignment assign(@PathVariable String vendorId,HttpServletRequest r)throws IOException{AuthController.noQuery(r);var s=policy.select(r);var b=AuthRequests.object(r,Set.of("expectedRevision","planRevisionId","reason"));return assignment(service.assign(s.secret(),s.transport(),csrf(r,s),ContactRequests.id(vendorId,"PATH","vendorId"),ContactRequests.revision(b),id(b,"planRevisionId"),text(b,"reason",1000)));}
 @PostMapping("/admin/plan-requests/{requestId}/approval") Request approve(@PathVariable String requestId,HttpServletRequest r)throws IOException{return resolve(requestId,r,true);}
 @PostMapping("/admin/plan-requests/{requestId}/rejection") Request reject(@PathVariable String requestId,HttpServletRequest r)throws IOException{return resolve(requestId,r,false);}
 private Request resolve(String id,HttpServletRequest r,boolean approve)throws IOException{AuthController.noQuery(r);var s=policy.select(r);var b=AuthRequests.object(r,Set.of("expectedRevision","reason"));return request(service.resolve(s.secret(),s.transport(),csrf(r,s),ContactRequests.id(id,"PATH","requestId"),ContactRequests.revision(b),approve,text(b,"reason",1000)));}
 private Assignment assignment(VendorPlans.Assignment a){return new Assignment(a.id(),revisions.encode("vendorplan/v1",a.id(),a.revision()),a.plan(),a.nonArchivedProductCount(),a.activeBuyerCount());}
 private Request request(VendorPlans.Request r){return new Request(r.id(),r.vendorId(),revisions.encode("planrequest/v1",r.id(),r.revision()),r.requestedPlanRevisionId(),r.state(),r.resolutionReason(),AccountResponses.time(r.createdAt()),AccountResponses.time(r.updatedAt()));}
 private static UUID id(tools.jackson.databind.JsonNode b,String key){return ContactRequests.id(text(b,key,36),"BODY","/"+key);}
 private static String text(tools.jackson.databind.JsonNode b,String key,int max){var errors=new ArrayList<AuthErrors.FieldError>();String v=OrganizationRequests.text(b,key,"",max,false,errors);if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}return v;}
 private static String csrf(HttpServletRequest r,SessionTransportPolicy.Selected s){return s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;}
 private static Query query(HttpServletRequest r,String extra){for(var e:r.getParameterMap().entrySet()){if(!Set.of("page","size","includeTotal",extra).contains(e.getKey())||e.getValue().length!=1){throw invalidQuery(e.getKey());}}return new Query(number(r,"page",0,0,10000),number(r,"size",25,1,100),bool(r,"includeTotal"));}
 private static boolean bool(HttpServletRequest r,String key){String v=r.getParameter(key);if(v!=null&&!Set.of("true","false").contains(v)){throw invalidQuery(key);}return "true".equals(v);}
 private static int number(HttpServletRequest r,String key,int fallback,int min,int max){String v=r.getParameter(key);if(v==null){return fallback;}try{if(!v.matches("0|[1-9][0-9]{0,5}")){throw new IllegalArgumentException();}int n=Integer.parseInt(v);if(n<min||n>max){throw new IllegalArgumentException();}return n;}catch(IllegalArgumentException e){throw invalidQuery(key);}}
 private static AuthHttpFailure invalidQuery(String k){return new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY",k,"INVALID_VALUE")));}
 record Query(int page,int size,boolean total){}
 record Page<T>(List<T> items,int page,int size,Long total){}
 record Assignment(UUID id,String revision,VendorPlans.Plan plan,int nonArchivedProductCount,int activeBuyerCount){}
 record Request(UUID id,UUID vendorId,String revision,UUID requestedPlanRevisionId,String state,String resolutionReason,String createdAt,String updatedAt){}
}
