package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.catalogue.api.VendorProducts;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.media.api.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.trading.api.TradingConnections;
import jakarta.servlet.http.HttpServletRequest;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/media/assets")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class ImageContentController {
    private final MediaAssets assets;
    private final ProcessedContentStorage storage;
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final BusinessAuthorization authorization;
    private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;
    private final VendorProducts products;
    private final TradingConnections trading;
    private final TransactionTemplate tx;
    private final Semaphore capacity=new Semaphore(4);

    ImageContentController(MediaAssets assets,ProcessedContentStorage storage,SessionService sessions,
            MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,
            LoginThrottle throttle,VendorProducts products,TradingConnections trading,PlatformTransactionManager manager){
        this.assets=assets;this.storage=storage;this.sessions=sessions;this.memberships=memberships;
        this.authorization=authorization;this.policy=policy;this.throttle=throttle;
        this.products=products;this.trading=trading;tx=new TransactionTemplate(manager);tx.setTimeout(10);
    }

    @GetMapping("/{assetId}/content") ResponseEntity<byte[]> content(@PathVariable String assetId,HttpServletRequest request){
        AuthController.noQuery(request);AuthController.noBody(request);
        UUID id=ContactRequests.id(assetId,"PATH","assetId");var selected=policy.select(request);
        UUID account=tx.execute(s->sessions.replayAdmissionAccount(selected.secret(),selected.transport()));
        throttle.admitApi(account,false);
        var initial=tx.execute(s->{
            var principal=sessions.authenticate(selected.secret(),selected.transport());
            return memberships.lockForAuthorization(principal.accountId()).orElseThrow(ImageContentController::missing);
        });
        var route=tx.execute(s->assets.route(id));
        var proof=tx.execute(s->authorized(selected,initial,route.vendor(),id));
        if(!capacity.tryAcquire()){throw new AuthHttpFailure(429,"RATE_LIMITED");}
        try{
            byte[] body=storage.content(proof.key(),proof.bytes(),proof.sha256());
            if(body==null||body.length!=proof.bytes()||body.length>5*1024*1024||!digest(body).equals(proof.sha256())){
                throw new MediaFailure("SERVICE_UNAVAILABLE");
            }
            tx.executeWithoutResult(s->{
                if(!proof.equals(authorized(selected,initial,route.vendor(),id))){throw missing();}
                sessions.recordSuccessfulActivity(selected.secret(),selected.transport());
            });
            return ResponseEntity.ok().header("Content-Type",proof.mediaType()).header("Cache-Control","private, no-store")
                    .header("X-Content-Type-Options","nosniff").header("Content-Disposition","inline")
                    .contentLength(body.length).body(body);
        }finally{capacity.release();}
    }

    private MediaAssets.Proof authorized(SessionTransportPolicy.Selected selected,LockedMembership initial,UUID vendor,UUID id){
        var principal=initial.type()==OrganizationType.BUYER
                ?sessions.authenticateForTradingWrite(selected.secret(),selected.transport(),vendor,initial.organizationId(),null)
                :sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport());
        var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(ImageContentController::missing);
        if(!member.organizationId().equals(initial.organizationId())||member.type()!=initial.type()){throw missing();}
        if(member.type()==OrganizationType.VENDOR){
            authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.EDIT_CATALOGUE);
            if(!vendor.equals(member.organizationId())){throw missing();}
        }else{
            var scope=authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.PREPARE_BUYER_ORDER);
            var relationship=trading.find(vendor,scope.organizationId()).orElseThrow(ImageContentController::missing);
            if(!relationship.state().equals("ACTIVE")||!relationship.country().equals(scope.country().name())
                    ||!trading.partner(scope.organizationId(),vendor).country().equals(scope.country().name())){throw missing();}
            var current=assets.route(id);
            if(!current.vendor().equals(vendor)||current.product()==null){throw missing();}
            var product=products.read(vendor,current.product());
            if(!product.state().equals("ACTIVE")||!product.galleryAssetIds().contains(id)){throw missing();}
        }
        var proof=assets.proof(id);if(!proof.vendor().equals(vendor)){throw missing();}return proof;
    }
    private static String digest(byte[] body){
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));}
        catch(NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}
    }
    private static MediaFailure missing(){return new MediaFailure("NOT_FOUND");}
}
