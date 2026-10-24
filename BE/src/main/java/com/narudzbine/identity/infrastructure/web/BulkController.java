package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.catalogue.api.VendorProducts;
import com.narudzbine.catalogue.api.VendorTaxonomy;
import com.narudzbine.catalogue.api.TaxonomyFailure;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.pricing.api.BasePricing;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/catalogue/bulk-edits")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class BulkController {
    private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;
    private final VendorProducts products;private final VendorTaxonomy taxonomy;private final BasePricing pricing;private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;private final ResourceRevisions revisions;private final TransactionTemplate transaction;
    BulkController(SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,VendorProducts products,VendorTaxonomy taxonomy,BasePricing pricing,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,PlatformTransactionManager manager){
        this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.products=products;this.taxonomy=taxonomy;this.pricing=pricing;this.policy=policy;this.throttle=throttle;this.revisions=revisions;
        transaction=new TransactionTemplate(manager);transaction.setTimeout(30);
    }
    @PostMapping Result edit(HttpServletRequest request)throws IOException{
        AuthController.noQuery(request);var selected=policy.select(request);String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null;
        var command=BulkRequests.input(request);UUID account=transaction.execute(s->sessions.authenticate(selected.secret(),selected.transport()).accountId());throttle.admitApi(account,true);
        return transaction.execute(status->{
            var principal=sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport());
            if(selected.transport()==SessionTransport.BROWSER){sessions.requireCsrf(selected.secret(),csrf);}
            var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE));
            if(member.type()!=OrganizationType.VENDOR){throw new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);}
            var scope=authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.EDIT_CATALOGUE);
            if(command.price()!=null||!command.corrections().isEmpty()){authorization.require(scope.accountId(),scope.organizationId(),scope.country(),BusinessCapability.EDIT_PRICES);}
            if(command.category()!=null){reference(scope.organizationId(),VendorTaxonomy.Kind.CATEGORY,command.category(),"/categoryId");}
            for(UUID id:command.add()){reference(scope.organizationId(),VendorTaxonomy.Kind.TAG,id,"/addTagIds");}
            for(UUID id:command.remove()){reference(scope.organizationId(),VendorTaxonomy.Kind.TAG,id,"/removeTagIds");}
            var sorted=command.targets().stream().sorted(Comparator.comparing(t->t.id().toString())).toList();
            var before=new HashMap<UUID,VendorProducts.Item>();var prices=new HashMap<UUID,BasePricing.Item>();
            // Check the whole batch before changing either revision domain.
            for(var target:sorted){
                var product=products.read(scope.organizationId(),target.id());
                if(!revisions.matches("product/v1",target.id(),product.revision(),target.productRevision())){throw new RevisionConflict(revisions.encode("product/v1",target.id(),product.revision()));}
                var price=pricing.read(scope.organizationId(),target.id());PricingController.requireRevision(revisions,price,target.pricingRevision());before.put(target.id(),product);prices.put(target.id(),price);
            }
            for(var target:sorted){
                var old=before.get(target.id());var values=old.values();
                var tags=new TreeSet<UUID>(Comparator.comparing(UUID::toString));tags.addAll(values.tagIds());tags.removeAll(command.remove());tags.addAll(command.add());
                if(tags.size()>50){throw new AuthHttpFailure(422,"VALIDATION_FAILED","/addTagIds");}
                if(Boolean.FALSE.equals(command.active())){products.publication(scope.accountId(),scope.organizationId(),target.id(),false);}
                if(command.price()!=null||command.corrections().containsKey(target.id())){
                    var price=prices.get(target.id());var next=new BasePricing.Values(BulkRequests.adjusted(command.price(),price.values().basePrice()),command.corrections().getOrDefault(target.id(),price.values().tiers()));
                    pricing.replace(scope.accountId(),scope.organizationId(),target.id(),price.revision(),next,null,null);
                }
                products.replace(scope.accountId(),scope.organizationId(),target.id(),new VendorProducts.Values(values.sku(),values.name(),values.description(),values.unitId(),values.packDescription(),command.categorySupplied()?command.category():values.categoryId(),List.copyOf(tags),values.minimumQuantity(),values.quantityStep()));
                if(Boolean.TRUE.equals(command.active())){products.publication(scope.accountId(),scope.organizationId(),target.id(),true);}
            }
            var result=new Result(command.targets().stream().map(t->ProductResponses.result(products.read(scope.organizationId(),t.id()),revisions)).toList(),command.targets().stream().map(t->priceResponse(pricing.read(scope.organizationId(),t.id()))).toList());
            sessions.recordSuccessfulActivity(selected.secret(),selected.transport());return result;
        });
    }
    private void reference(UUID vendor,VendorTaxonomy.Kind kind,UUID id,String path){
        try{if(taxonomy.read(vendor,kind,id).deleted()){throw new AuthHttpFailure(422,"VALIDATION_FAILED",path);}}
        catch(TaxonomyFailure failure){throw new AuthHttpFailure(422,"VALIDATION_FAILED",path);}
    }
    private PricingController.Result priceResponse(BasePricing.Item item){return new PricingController.Result(item.productId(),revisions.encode("pricing/v1",item.productId(),item.revision()),item.productId(),item.values().basePrice()==null?null:item.values().basePrice().toPlainString(),item.values().tiers().stream().map(t->new PricingController.Tier(t.minimumQuantity(),t.unitPrice().toPlainString())).toList(),item.currency());}
    record Result(List<ProductController.Result> products,List<PricingController.Result> prices){}
}
