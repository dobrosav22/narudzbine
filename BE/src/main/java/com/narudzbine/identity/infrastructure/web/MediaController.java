package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.media.api.*;
import com.narudzbine.audit.api.UploadAudit;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/media/assets")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class MediaController {
    private final MediaUploads uploads;private final PrivateQuarantine storage;private final UploadAudit audit;private final SessionService sessions;private final MembershipAccess memberships;private final BusinessAuthorization authorization;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final ResourceRevisions revisions;private final TransactionTemplate tx;private final Semaphore capacity=new Semaphore(4);
    MediaController(MediaUploads uploads,PrivateQuarantine storage,UploadAudit audit,SessionService sessions,MembershipAccess memberships,BusinessAuthorization authorization,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,PlatformTransactionManager manager){this.uploads=uploads;this.storage=storage;this.audit=audit;this.sessions=sessions;this.memberships=memberships;this.authorization=authorization;this.policy=policy;this.throttle=throttle;this.revisions=revisions;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
    @GetMapping("/{assetId}") Result get(@PathVariable String assetId,HttpServletRequest r){AuthController.noQuery(r);AuthController.noBody(r);UUID id=ContactRequests.id(assetId,"PATH","assetId");var selected=policy.select(r);admit(selected,false);return tx.execute(s->{var scope=scope(selected,false,null);var result=uploads.read(scope.organizationId(),id);activity(selected);return result(result);});}
    @PutMapping("/{assetId}/upload") ResponseEntity<Result> upload(@PathVariable String assetId,HttpServletRequest r){
        AuthController.noQuery(r);UUID id=ContactRequests.id(assetId,"PATH","assetId");var selected=policy.select(r);String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;admit(selected,true);
        var initial=tx.execute(s->scope(selected,true,csrf));throttle.admitUpload(initial.organizationId());
        if(!capacity.tryAcquire()){throw new AuthHttpFailure(429,"RATE_LIMITED");}
        try(var body=UploadBody.read(r)){
            var claim=tx.execute(s->{var scope=scope(selected,true,csrf);var c=uploads.reserve(scope.organizationId(),id,new MediaUploads.Source(body.bytes,body.sha256,body.mediaType));if(c.created()){audit.upload(scope.accountId(),id,false);}return c;});
            if(!claim.replay()){storage.ensure(claim.key(),body.path,body.bytes,body.sha256,body.md5,body.mediaType);}
            return tx.execute(s->{var scope=scope(selected,true,csrf);MediaUploads.Asset asset;if(claim.replay()){asset=uploads.read(scope.organizationId(),id);}else{var completed=uploads.complete(scope.organizationId(),id,claim.fence());asset=completed.asset();if(completed.confirmed()){audit.upload(scope.accountId(),id,true);}}activity(selected);return ResponseEntity.accepted().header("Location","/api/v1/media/assets/"+id).body(result(asset));});
        }finally{capacity.release();}
    }
    private BusinessScope scope(SessionTransportPolicy.Selected selected,boolean write,String csrf){var principal=sessions.authenticateForOrganizationWrite(selected.secret(),selected.transport());if(write&&selected.transport()==SessionTransport.BROWSER){sessions.requireCsrf(selected.secret(),csrf);}var member=memberships.lockForAuthorization(principal.accountId()).orElseThrow(()->new MediaFailure("NOT_FOUND"));if(member.type()!=OrganizationType.VENDOR){throw new MediaFailure("NOT_FOUND");}return authorization.require(principal.accountId(),member.organizationId(),member.country(),BusinessCapability.EDIT_CATALOGUE);}
    private void admit(SessionTransportPolicy.Selected s,boolean write){UUID account=tx.execute(t->sessions.replayAdmissionAccount(s.secret(),s.transport()));throttle.admitApi(account,write);}
    private void activity(SessionTransportPolicy.Selected s){sessions.recordSuccessfulActivity(s.secret(),s.transport());}
    private Result result(MediaUploads.Asset a){return new Result(a.id(),revisions.encode("asset/v1",a.id(),a.revision()),a.state(),a.mediaType(),a.width(),a.height(),a.failureCode(),AccountResponses.time(a.createdAt()));}
    record Result(UUID id,String revision,String state,String mediaType,Integer width,Integer height,String failureCode,String createdAt){}
}
