package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.pricing.api.*;
import com.narudzbine.pricing.api.VendorPromotions.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/promotions")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class PromotionController {
 private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final VendorPromotions promotions;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final ResourceRevisions revisions;private final TransactionTemplate tx;private final byte[] creationKey;
 PromotionController(SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,VendorPromotions promotions,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,PlatformTransactionManager manager,@Value("${identity.http.revision-key}")String key){this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.promotions=promotions;this.policy=policy;this.throttle=throttle;this.revisions=revisions;this.creationKey=Base64.getDecoder().decode(key);tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @GetMapping Page list(HttpServletRequest request){AuthController.noBody(request);var query=PromotionRequests.query(request);var selected=policy.select(request);admit(selected,false);return tx.execute(status->{var scope=scope(selected,false,null);var page=promotions.list(scope.organizationId(),query.page(),query.size(),query.total(),query.state());activity(selected);return new Page(page.items().stream().map(this::response).toList(),query.page(),query.size(),page.total());});}
 @GetMapping("/{promotionId}") Result get(@PathVariable String promotionId,HttpServletRequest request){AuthController.noBody(request);AuthController.noQuery(request);UUID id=ContactRequests.id(promotionId,"PATH","promotionId");var selected=policy.select(request);admit(selected,false);return tx.execute(status->{var scope=scope(selected,false,null);var item=promotions.get(scope.organizationId(),id);activity(selected);return response(item);});}
 @PostMapping ResponseEntity<Object> create(HttpServletRequest request)throws IOException{AuthController.noQuery(request);var input=PromotionRequests.input(request,true);var selected=policy.select(request);String csrf=csrf(selected,request);admit(selected,true);return tx.execute(status->{var scope=scope(selected,true,csrf);var values=PromotionRequests.values(input,scope.country());var result=promotions.create(scope.accountId(),scope.organizationId(),input.id(),values,PromotionRequests.digest(values,creationKey));activity(selected);return ResponseEntity.status(result.replay()?200:201).header("Location","/api/v1/promotions/"+input.id()).body(response(result.item()));});}
 @PutMapping("/{promotionId}") Result update(@PathVariable String promotionId,HttpServletRequest request)throws IOException{AuthController.noQuery(request);UUID id=ContactRequests.id(promotionId,"PATH","promotionId");var input=PromotionRequests.input(request,false);var selected=policy.select(request);String csrf=csrf(selected,request);admit(selected,true);return tx.execute(status->{var scope=scope(selected,true,csrf);requireRevision(promotions.get(scope.organizationId(),id),input.revision());var result=promotions.replace(scope.accountId(),scope.organizationId(),id,PromotionRequests.values(input,scope.country()));activity(selected);return response(result);});}
 @PostMapping("/{promotionId}/{action:stop|archive}") Result action(@PathVariable String promotionId,@PathVariable String action,HttpServletRequest request)throws IOException{AuthController.noQuery(request);UUID id=ContactRequests.id(promotionId,"PATH","promotionId");String expected=ContactRequests.revisionCommand(request);var selected=policy.select(request);String csrf=csrf(selected,request);admit(selected,true);return tx.execute(status->{var scope=scope(selected,true,csrf);requireRevision(promotions.get(scope.organizationId(),id),expected);var item=action.equals("stop")?promotions.stop(scope.accountId(),scope.organizationId(),id):promotions.archive(scope.accountId(),scope.organizationId(),id);activity(selected);return response(item);});}
 private BusinessScope scope(SessionTransportPolicy.Selected selected,boolean write,String csrf){var principal=sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport());if(write&&selected.transport()==SessionTransport.BROWSER){sessions.requireCsrf(selected.secret(),csrf);}var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE));if(member.type()!=OrganizationType.VENDOR){throw new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);}return authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.EDIT_PROMOTIONS);}
 private void requireRevision(Item i,String expected){if(!revisions.matches("promotion/v1",i.id(),i.revision(),expected)){throw new RevisionConflict(revisions.encode("promotion/v1",i.id(),i.revision()));}}
 private void admit(SessionTransportPolicy.Selected s,boolean write){UUID actor=tx.execute(status->sessions.authenticate(s.secret(),s.transport()).accountId());throttle.admitApi(actor,write);}
 private void activity(SessionTransportPolicy.Selected s){sessions.recordSuccessfulActivity(s.secret(),s.transport());}
 private static String csrf(SessionTransportPolicy.Selected s,HttpServletRequest r){return s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;}
 private Result response(Item i){var v=i.values();return new Result(i.id(),revisions.encode("promotion/v1",i.id(),i.revision()),v.name(),v.kind().name(),v.value().toPlainString(),new Targets(v.productMode().name(),v.buyerMode().name(),v.productIds(),v.categoryIds(),v.buyerIds()),i.labels(),AccountResponses.time(v.startsAt()),AccountResponses.time(v.endsAt()),i.state(),AccountResponses.time(i.createdAt()),AccountResponses.time(i.updatedAt()),i.archived());}
 record Targets(String productMode,String buyerMode,List<UUID> productIds,List<UUID> categoryIds,List<UUID> buyerIds){}
 record Result(UUID id,String revision,String name,String kind,String value,Targets targets,Labels targetLabels,String startsAt,String endsAt,String state,String createdAt,String updatedAt,boolean archived){}
 record Page(List<Result> items,int page,int size,Long total){}
}
