package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.pricing.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/catalogue/products/{productId}/pricing")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class PricingController {
 private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final BasePricing pricing;private final com.narudzbine.catalogue.api.VendorProducts products;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final ResourceRevisions revisions;private final TransactionTemplate transaction;private final byte[] intentKey;
 PricingController(SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,BasePricing pricing,com.narudzbine.catalogue.api.VendorProducts products,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,PlatformTransactionManager manager,@org.springframework.beans.factory.annotation.Value("${identity.http.revision-key}")String key){this.intentKey=Base64.getDecoder().decode(key);this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.pricing=pricing;this.products=products;this.policy=policy;this.throttle=throttle;this.revisions=revisions;transaction=new TransactionTemplate(manager);transaction.setTimeout(10);}
 @GetMapping Result get(@PathVariable String productId,HttpServletRequest request){AuthController.noBody(request);AuthController.noQuery(request);UUID id=ContactRequests.id(productId,"PATH","productId");var selected=policy.select(request);admit(selected,false);return transaction.execute(status->{var scope=scope(selected,false,null);var item=pricing.read(scope.organizationId(),id);activity(selected);return response(item);});}
 @PutMapping Result update(@PathVariable String productId,HttpServletRequest request)throws IOException{AuthController.noQuery(request);UUID id=ContactRequests.id(productId,"PATH","productId");var selected=policy.select(request);String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null;var input=PricingRequests.input(request);admit(selected,true);return transaction.execute(status->{var scope=scope(selected,true,csrf);if(input.deactivateProduct()){authorization.require(scope.accountId(),scope.organizationId(),scope.country(),BusinessCapability.EDIT_CATALOGUE);}byte[] identity=input.deactivateProduct()?StockRequests.digest("pricing-deactivation",intentKey,id,input.expectedRevision(),input.values()):null;if(identity!=null){var replay=pricing.replayDeactivation(scope.accountId(),scope.organizationId(),id,identity);if(replay.isPresent()){activity(selected);return response(replay.get());}}var current=pricing.read(scope.organizationId(),id);requireRevision(revisions,current,input.expectedRevision());boolean publicationChanged=input.deactivateProduct()&&products.read(scope.organizationId(),id).state().equals("ACTIVE");if(publicationChanged){products.publication(scope.accountId(),scope.organizationId(),id,false);}var result=pricing.replace(scope.accountId(),scope.organizationId(),id,current.revision(),input.values(),null,null,publicationChanged);if(identity!=null){pricing.rememberDeactivation(scope.accountId(),scope.organizationId(),id,identity,result);}activity(selected);return response(result);});}
 static void requireRevision(ResourceRevisions revisions,BasePricing.Item current,String expected){if(!revisions.matches("pricing/v1",current.productId(),current.revision(),expected)){throw new PricingFailure(PricingFailure.Reason.REVISION_CONFLICT,List.of(),current.productId(),current.revision());}}
 private BusinessScope scope(SessionTransportPolicy.Selected selected,boolean write,String csrf){var principal=write?sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport()):sessions.authenticate(selected.secret(),selected.transport());if(write&&selected.transport()==SessionTransport.BROWSER){sessions.requireCsrf(selected.secret(),csrf);}var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE));if(member.type()!=OrganizationType.VENDOR){throw new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);}return authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.EDIT_PRICES);}
 private void admit(SessionTransportPolicy.Selected selected,boolean write){UUID account=transaction.execute(s->sessions.authenticate(selected.secret(),selected.transport()).accountId());throttle.admitApi(account,write);}
 private void activity(SessionTransportPolicy.Selected selected){sessions.recordSuccessfulActivity(selected.secret(),selected.transport());}
 private Result response(BasePricing.Item item){return new Result(item.productId(),revisions.encode("pricing/v1",item.productId(),item.revision()),item.productId(),item.values().basePrice()==null?null:item.values().basePrice().toPlainString(),item.values().tiers().stream().map(t->new Tier(t.minimumQuantity(),t.unitPrice().toPlainString())).toList(),item.currency());}
 record Tier(int minimumQuantity,String unitPrice){ }
 record Result(UUID id,String revision,UUID productId,String basePrice,List<Tier> tiers,String currency){ }
}
