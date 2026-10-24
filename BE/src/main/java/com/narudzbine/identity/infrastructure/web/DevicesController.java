package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/me/devices")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class DevicesController {
    private final DeviceService devices;
    private final ObjectProvider<DeviceVerification> verifier;
    private final SessionService sessions;
    private final SessionTransportPolicy policy;
    private final LoginThrottle throttle;
    private final ResourceRevisions revisions;
    private final TransactionTemplate tx;

    DevicesController(DeviceService devices,ObjectProvider<DeviceVerification> verifier,SessionService sessions,
                      SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,PlatformTransactionManager manager) {
        this.devices=devices;this.verifier=verifier;this.sessions=sessions;this.policy=policy;this.throttle=throttle;this.revisions=revisions;
        tx=new TransactionTemplate(manager);tx.setTimeout(10);
    }

    @PostMapping
    ResponseEntity<?> register(HttpServletRequest request)throws IOException {
        AuthController.noQuery(request);var selected=policy.select(request);String csrf=csrf(request,selected);
        var body=AuthRequests.object(request,Set.of("installationId","platform","pushToken","verificationId","verificationCode"));
        UUID installation;
        try {
            if(!body.path("installationId").isString())throw new IllegalArgumentException();
            String value=body.path("installationId").asString();installation=UUID.fromString(value);
            if(!installation.toString().equals(value)||installation.variant()!=2)throw new IllegalArgumentException();
        } catch(IllegalArgumentException exception) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/installationId"); }
        String platform=body.path("platform").isString()?body.path("platform").asString():"";
        if(!Set.of("WEB","ANDROID","IOS").contains(platform))throw new AuthHttpFailure(422,"VALIDATION_FAILED","/platform");
        String token=body.path("pushToken").isString()?body.path("pushToken").asString():"";
        if(token.isEmpty()||token.length()>4096||token.chars().anyMatch(c->c<33||c>126))throw new AuthHttpFailure(422,"VALIDATION_FAILED","/pushToken");
        admit(selected,true);
        var actor=tx.execute(s->scope(selected,csrf,true));
        UUID verificationId=null;String code=null;
        if(body.has("verificationId")||body.has("verificationCode")){
            verificationId=ContactRequests.id(body.path("verificationId").isString()?body.path("verificationId").asString():null,"BODY","/verificationId");
            code=body.path("verificationCode").isString()?body.path("verificationCode").asString():"";
            if(!code.matches("[A-Za-z0-9_-]{43}"))throw new AuthHttpFailure(422,"VALIDATION_FAILED","/verificationCode");
        }
        DeviceVerification.Outcome outcome;
        var provider=verifier.getIfAvailable();if(provider==null)throw new DeviceService.Failure("SERVICE_UNAVAILABLE");
        try {outcome=provider.verifyOrChallenge(new DeviceVerification.Request(actor.accountId(),actor.sessionId(),installation,platform,token),verificationId,code);}
        catch(DeviceService.Failure|InvalidSession expected){throw expected;}
        catch(RuntimeException unavailable){throw new DeviceService.Failure("SERVICE_UNAVAILABLE");}
        if(outcome!=null&&outcome.challenge()!=null){tx.executeWithoutResult(t->{scope(selected,csrf,true);activity(selected);});var challenge=outcome.challenge();return ResponseEntity.accepted().body(new Verification(challenge.id(),AccountResponses.time(challenge.expiresAt())));}
        DeviceVerification.Proof proof=outcome==null?null:outcome.proof();
        var result=tx.execute(s->{var current=scope(selected,csrf,true);var saved=item(devices.register(current,installation,platform,token,proof));activity(selected);return saved;});
        return ResponseEntity.created(URI.create("/api/v1/me/devices/"+result.id())).body(result);
    }

    @GetMapping
    Page list(HttpServletRequest request) {
        AuthController.noBody(request);
        if(request.getParameterMap().containsKey("state"))throw StockRequests.invalid("state");
        var query=ContactRequests.query(request);var selected=policy.select(request);admit(selected,false);
        return tx.execute(s->{var actor=scope(selected,null,false);var result=devices.list(actor.accountId(),query.page(),query.size(),query.total());activity(selected);return new Page(result.items().stream().map(this::item).toList(),result.page(),result.size(),result.total());});
    }

    @DeleteMapping("/{deviceId}")
    ResponseEntity<Void> remove(@PathVariable String deviceId,HttpServletRequest request) {
        AuthController.noQuery(request);AuthController.noBody(request);UUID id=ContactRequests.id(deviceId,"PATH","deviceId");
        var selected=policy.select(request);String csrf=csrf(request,selected);admit(selected,true);
        tx.executeWithoutResult(s->{var actor=scope(selected,csrf,true);devices.remove(actor.accountId(),id);activity(selected);});
        return ResponseEntity.noContent().build();
    }
    private AuthenticatedSession scope(SessionTransportPolicy.Selected s,String csrf,boolean write) {
        var actor=sessions.authenticateForProfileWrite(s.secret(),s.transport());
        if(write&&s.transport()==SessionTransport.BROWSER)sessions.requireCsrf(s.secret(),csrf);return actor;
    }
    private void admit(SessionTransportPolicy.Selected s,boolean write) {var id=tx.execute(t->sessions.replayAdmissionAccount(s.secret(),s.transport()));throttle.admitApi(id,write);}
    private String csrf(HttpServletRequest r,SessionTransportPolicy.Selected s) {return s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;}
    private void activity(SessionTransportPolicy.Selected s) {sessions.recordSuccessfulActivity(s.secret(),s.transport());}
    private Item item(DeviceService.Item d) {return new Item(d.id(),revisions.encode("device/v1",d.id(),d.revision()),d.installationId(),d.platform(),d.enabled(),AccountResponses.time(d.createdAt()));}
    record Verification(UUID id,String expiresAt) {}
    record Item(UUID id,String revision,UUID installationId,String platform,boolean enabled,String createdAt) {}
    record Page(List<Item> items,int page,int size,Long total) {}
}
