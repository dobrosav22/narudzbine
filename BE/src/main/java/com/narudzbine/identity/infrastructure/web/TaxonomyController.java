package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.catalogue.api.*;
import com.narudzbine.catalogue.api.VendorTaxonomy.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/catalogue/{collection:categories|tags|units}")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class TaxonomyController {
 private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final VendorTaxonomy taxonomy;
 private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final ResourceRevisions revisions;private final TransactionTemplate transaction;private final byte[] creationKey;
 TaxonomyController(SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,VendorTaxonomy taxonomy,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,PlatformTransactionManager manager,@org.springframework.beans.factory.annotation.Value("${identity.http.revision-key}")String key){this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.taxonomy=taxonomy;this.policy=policy;this.throttle=throttle;this.revisions=revisions;this.creationKey=Base64.getDecoder().decode(key);transaction=new TransactionTemplate(manager);transaction.setTimeout(10);}
 @GetMapping Page list(@PathVariable String collection,HttpServletRequest request){AuthController.noBody(request);var query=TaxonomyRequests.query(request);var selected=policy.select(request);admit(selected,false);Kind kind=kind(collection);
  return transaction.execute(status->{var scope=scope(selected,false,null);var page=taxonomy.list(scope.organizationId(),kind,query.page(),query.size(),query.total(),query.query(),query.createdSort());activity(selected);return new Page(page.items().stream().map(i->response(kind,i)).toList(),query.page(),query.size(),page.total());});
 }
 @PostMapping ResponseEntity<Object> create(@PathVariable String collection,HttpServletRequest request)throws IOException{AuthController.noQuery(request);Kind kind=kind(collection);var selected=policy.select(request);String csrf=csrf(request,selected);var input=TaxonomyRequests.input(request,kind,true);admit(selected,true);
  return transaction.execute(status->{var scope=scope(selected,true,csrf);var created=taxonomy.create(scope.accountId(),scope.organizationId(),kind,input.id(),input.name(),TaxonomyRequests.digest(kind,input.name(),creationKey));activity(selected);return ResponseEntity.status(created.replay()?200:201).header("Location","/api/v1/catalogue/"+collection+"/"+input.id()).body(response(kind,created.item()));});
 }
 @PutMapping("/{resourceId}") Object update(@PathVariable String collection,@PathVariable String resourceId,HttpServletRequest request)throws IOException{AuthController.noQuery(request);Kind kind=kind(collection);UUID id=ContactRequests.id(resourceId,"PATH","resourceId");var selected=policy.select(request);String csrf=csrf(request,selected);var input=TaxonomyRequests.input(request,kind,false);admit(selected,true);
  return transaction.execute(status->{var scope=scope(selected,true,csrf);var current=taxonomy.read(scope.organizationId(),kind,id);if(current.deleted()){throw new TaxonomyFailure(TaxonomyFailure.Reason.NOT_FOUND,null);}revision(kind,current,input.expectedRevision(),false);var result=taxonomy.rename(scope.accountId(),scope.organizationId(),kind,id,input.name());activity(selected);return response(kind,result);});
 }
 @DeleteMapping("/{resourceId}") ResponseEntity<Void> delete(@PathVariable String collection,@PathVariable String resourceId,HttpServletRequest request){AuthController.noBody(request);String expected=TaxonomyRequests.deletion(request);Kind kind=kind(collection);UUID id=ContactRequests.id(resourceId,"PATH","resourceId");var selected=policy.select(request);String csrf=csrf(request,selected);admit(selected,true);
  return transaction.execute(status->{var scope=scope(selected,true,csrf);var current=taxonomy.read(scope.organizationId(),kind,id);revision(kind,current,expected,true);taxonomy.delete(scope.accountId(),scope.organizationId(),kind,id);activity(selected);return ResponseEntity.noContent().build();});
 }
 private void revision(Kind kind,Item current,String expected,boolean deletion){long value=deletion&&current.deleted()?current.revision()-1:current.revision();if(!revisions.matches(domain(kind),current.id(),value,expected)){throw new RevisionConflict(revisions.encode(domain(kind),current.id(),current.revision()));}}
 private BusinessScope scope(SessionTransportPolicy.Selected selected,boolean write,String csrf){var principal=write?sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport()):sessions.authenticate(selected.secret(),selected.transport());if(write&&selected.transport()==SessionTransport.BROWSER){sessions.requireCsrf(selected.secret(),csrf);}var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE));if(member.type()!=OrganizationType.VENDOR){throw new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);}return authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.EDIT_CATALOGUE);}
 private void admit(SessionTransportPolicy.Selected selected,boolean write){UUID account=transaction.execute(s->sessions.authenticate(selected.secret(),selected.transport()).accountId());throttle.admitApi(account,write);}
 private void activity(SessionTransportPolicy.Selected selected){sessions.recordSuccessfulActivity(selected.secret(),selected.transport());}
 private static String csrf(HttpServletRequest request,SessionTransportPolicy.Selected selected){return selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null;}
 private static Kind kind(String collection){return switch(collection){case "categories"->Kind.CATEGORY;case "tags"->Kind.TAG;case "units"->Kind.UNIT;default->throw new IllegalArgumentException();};}
 private static String domain(Kind kind){return kind.name().toLowerCase(Locale.ROOT)+"/v1";}
 private Object response(Kind kind,Item item){String revision=revisions.encode(domain(kind),item.id(),item.revision());return kind==Kind.UNIT?new Unit(item.id(),revision,item.name(),item.nameFrozen()):new Named(item.id(),revision,item.name());}
 record Named(UUID id,String revision,String name){ }
 record Unit(UUID id,String revision,String name,boolean nameFrozen){ }
 record Page(List<Object> items,int page,int size,Long total){ }
}
