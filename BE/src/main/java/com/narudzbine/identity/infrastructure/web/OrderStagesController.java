package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.ordering.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/organization/order-stages")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class OrderStagesController {
 private final OrderStages stages;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final Clock clock;private final TransactionTemplate tx;
 OrderStagesController(OrderStages stages,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,Clock clock,PlatformTransactionManager manager){this.stages=stages;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @GetMapping ConfigurationResult list(HttpServletRequest r){AuthController.noQuery(r);AuthController.noBody(r);var selected=policy.select(r);admit(selected,false);return tx.execute(status->{var scope=scope(selected,false,null);var result=stages.list(scope.organizationId());activity(selected);return configuration(result);});}
 @PostMapping ResponseEntity<StageResult> create(HttpServletRequest r)throws IOException{AuthController.noQuery(r);var b=AuthRequests.object(r,Set.of("id","name"));UUID id=ContactRequests.id(b.path("id").isString()?b.path("id").asString():null,"BODY","/id");if(id.version()!=7||id.variant()!=2){throw new AuthHttpFailure(422,"VALIDATION_FAILED","/id");}String name=name(b);var selected=policy.select(r);String csrf=csrf(selected,r);admit(selected,true);var result=tx.execute(status->{var scope=scope(selected,true,csrf);var stage=stages.create(scope.accountId(),scope.organizationId(),id,name,now());activity(selected);return stage;});return ResponseEntity.created(java.net.URI.create("/api/v1/organization/order-stages/"+id)).body(stage(result));}
 @PutMapping("/{stageId}") StageResult rename(@PathVariable String stageId,HttpServletRequest r)throws IOException{AuthController.noQuery(r);UUID id=ContactRequests.id(stageId,"PATH","stageId");var b=AuthRequests.object(r,Set.of("expectedRevision","name"));String expected=ContactRequests.revision(b),name=name(b);return change(r,id,expected,name,false);}
 @PostMapping("/{stageId}/retirement") StageResult retire(@PathVariable String stageId,HttpServletRequest r)throws IOException{AuthController.noQuery(r);UUID id=ContactRequests.id(stageId,"PATH","stageId");var b=AuthRequests.object(r,Set.of("expectedRevision"));return change(r,id,ContactRequests.revision(b),null,true);}
 private StageResult change(HttpServletRequest r,UUID id,String expected,String name,boolean retire){var selected=policy.select(r);String csrf=csrf(selected,r);admit(selected,true);return tx.execute(status->{var scope=scope(selected,true,csrf);var result=stages.change(scope.accountId(),scope.organizationId(),id,expected,name,retire,now());activity(selected);return stage(result);});}
 @PutMapping("/order") ConfigurationResult reorder(HttpServletRequest r)throws IOException{AuthController.noQuery(r);var b=AuthRequests.object(r,Set.of("expectedRevision","stageIds"));String expected=ContactRequests.revision(b);if(!b.path("stageIds").isArray()||b.path("stageIds").size()>20){throw new AuthHttpFailure(422,"VALIDATION_FAILED","/stageIds");}var ids=new ArrayList<UUID>();for(var item:b.path("stageIds")){ids.add(ContactRequests.id(item.isString()?item.asString():null,"BODY","/stageIds/"+ids.size()));}if(new HashSet<>(ids).size()!=ids.size()){throw new AuthHttpFailure(422,"VALIDATION_FAILED","/stageIds");}var selected=policy.select(r);String csrf=csrf(selected,r);admit(selected,true);return tx.execute(status->{var scope=scope(selected,true,csrf);var result=stages.reorder(scope.accountId(),scope.organizationId(),expected,ids,now());activity(selected);return configuration(result);});}
 private BusinessScope scope(SessionTransportPolicy.Selected selected,boolean write,String csrf){var principal=sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport());if(write&&selected.transport()==SessionTransport.BROWSER){sessions.requireCsrf(selected.secret(),csrf);}var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new StageFailure(StageFailure.Reason.NOT_FOUND));if(member.type()!=OrganizationType.VENDOR){throw new StageFailure(StageFailure.Reason.NOT_FOUND);}return authorization.require(principal.accountId(),member.organizationId(),member.country(),write?BusinessCapability.MANAGE_ORDER_STAGES:BusinessCapability.READ_OWN_ORGANIZATION);}
 private void admit(SessionTransportPolicy.Selected selected,boolean write){var admission=tx.execute(status->sessions.replayAdmissionVendor(selected.secret(),selected.transport()));throttle.admitApi(admission.actor(),write);}
 private void activity(SessionTransportPolicy.Selected selected){sessions.recordSuccessfulActivity(selected.secret(),selected.transport());}
 private static String csrf(SessionTransportPolicy.Selected selected,HttpServletRequest r){return selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
 private static String name(tools.jackson.databind.JsonNode b){var errors=new ArrayList<AuthErrors.FieldError>();String name=OrganizationRequests.text(b,"name","",100,false,errors);if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}return name;}
 private static StageResult stage(OrderStages.Stage s){return new StageResult(s.id(),s.originalRevision(),s.name(),s.state(),s.position());}
 private static ConfigurationResult configuration(OrderStages.Configuration c){return new ConfigurationResult(c.id(),c.originalRevision(),c.stages().stream().map(OrderStagesController::stage).toList());}
 record StageResult(UUID id,String revision,String name,String state,int position){}
 record ConfigurationResult(UUID id,String revision,List<StageResult> stages){}
}
