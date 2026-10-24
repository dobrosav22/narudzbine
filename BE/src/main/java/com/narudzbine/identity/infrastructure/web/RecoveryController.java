package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.application.RecoveryService;
import com.narudzbine.identity.application.LoginInput;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name={"identity.http.enabled","identity.recovery.http.enabled"},havingValue="true")
public final class RecoveryController {
    private final RecoveryService recovery;
    private final SessionTransportPolicy policy;
    RecoveryController(RecoveryService recovery,SessionTransportPolicy policy){this.recovery=recovery;this.policy=policy;}
    @PostMapping("/admin/recovery-cases")
    ResponseEntity<Result> create(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);var selected=policy.select(request);String csrf=csrf(request,selected);
        var body=AuthRequests.object(request,Set.of("id","kind","organizationId","targetAccountId","newEmail","reason","evidenceReference"));
        String kind=text(body,"kind",5);if(!Set.of("EMAIL","OWNER").contains(kind)){throw invalid("kind");}
        String email=null;if(!body.has("newEmail")){throw invalid("newEmail");}
        if(!body.path("newEmail").isNull()){try{email=LoginInput.email(text(body,"newEmail",254));}catch(IllegalArgumentException ex){throw invalid("newEmail");}}
        if(kind.equals("EMAIL")!=(email!=null)){throw invalid("newEmail");}
        var input=new RecoveryService.Request(id(body,"id"),kind,id(body,"organizationId"),id(body,"targetAccountId"),email,text(body,"reason",1000),reference(body));
        var created=recovery.create(selected.secret(),selected.transport(),csrf,input);
        return ResponseEntity.status(created.replay()?200:201).header("Location","/api/v1/admin/recovery-cases/"+input.id()).body(result(created.recovery()));
    }
    @GetMapping("/admin/recovery-cases/{caseId}")
    Result get(@PathVariable String caseId,HttpServletRequest request){AuthController.noQuery(request);AuthController.noBody(request);var selected=policy.select(request);return result(recovery.get(selected.secret(),selected.transport(),ContactRequests.id(caseId,"PATH","caseId")));}
    @PostMapping("/admin/recovery-cases/{caseId}/review")
    Result review(@PathVariable String caseId,HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);var selected=policy.select(request);String csrf=csrf(request,selected);
        var body=AuthRequests.object(request,Set.of("expectedRevision","approve","reason","evidenceReference"));if(!body.path("approve").isBoolean()){throw invalid("approve");}
        return result(recovery.review(selected.secret(),selected.transport(),csrf,ContactRequests.id(caseId,"PATH","caseId"),ContactRequests.revision(body),body.path("approve").asBoolean(),text(body,"reason",1000),reference(body)));
    }
    @PostMapping("/recovery-cases/{caseId}/acceptance")
    ResponseEntity<Acknowledgement> accept(@PathVariable String caseId,HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);var selected=policy.select(request);String csrf=csrf(request,selected);var body=AuthRequests.object(request,Set.of("token"));String token=body.path("token").isString()?body.path("token").asString():"";
        if(!token.matches("[A-Za-z0-9_-]{43}")){throw invalid("token");}
        boolean replay=recovery.accept(selected.secret(),selected.transport(),csrf,ContactRequests.id(caseId,"PATH","caseId"),token);var response=ResponseEntity.ok();
        if(!replay&&selected.transport()==SessionTransport.BROWSER){response.header("Set-Cookie",policy.clearCookie().toString());}return response.body(new Acknowledgement(true));
    }
    private static UUID id(JsonNode body,String key){return ContactRequests.id(text(body,key,36),"BODY","/"+key);}
    private static String text(JsonNode body,String key,int max){var errors=new ArrayList<AuthErrors.FieldError>();String value=OrganizationRequests.text(body,key,"",max,false,errors);if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}return value;}
    private static String reference(JsonNode body){String value=text(body,"evidenceReference",200);if(!value.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}")){throw invalid("evidenceReference");}return value;}
    private static String csrf(HttpServletRequest r,SessionTransportPolicy.Selected s){return s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;}
    private static AuthHttpFailure invalid(String key){return new AuthHttpFailure(422,"VALIDATION_FAILED","/"+key);}
    private static Result result(RecoveryService.View v){return new Result(v.id(),v.revision(),v.kind(),v.organizationId(),v.targetAccountId(),v.state(),AccountResponses.time(v.notBefore()),AccountResponses.time(v.expiresAt()));}
    record Result(UUID id,String revision,String kind,UUID organizationId,UUID targetAccountId,String state,String notBefore,String expiresAt){}
    record Acknowledgement(boolean accepted){}
}
