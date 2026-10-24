package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.application.EmailChangeService;
import com.narudzbine.identity.application.LoginInput;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class EmailChangeController {
    private final EmailChangeService emails;
    private final SessionTransportPolicy policy;
    EmailChangeController(EmailChangeService emails,SessionTransportPolicy policy) { this.emails=emails;this.policy=policy; }
    @PostMapping("/email-changes")
    ResponseEntity<Result> request(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);var selected=policy.select(request);String csrf=csrf(request,selected);
        var body=AuthRequests.object(request,Set.of("newEmail","expectedRevision"));
        String email=string(body,"newEmail");try { LoginInput.email(email); } catch(IllegalArgumentException e) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/newEmail"); }
        String revision=ContactRequests.revision(body);
        var created=emails.request(selected.secret(),selected.transport(),csrf,email,revision);
        return ResponseEntity.status(created.replay()?200:201).header("Location","/api/v1/auth/email-changes/"+created.change().id()).body(result(created.change()));
    }
    @GetMapping("/email-changes/{changeId}")
    Result get(@PathVariable String changeId,HttpServletRequest request) {
        AuthController.noQuery(request);AuthController.noBody(request);UUID id=LocationRequests.id(changeId,"PATH","changeId");var selected=policy.select(request);
        return result(emails.get(selected.secret(),selected.transport(),id));
    }
    @DeleteMapping("/email-changes/{changeId}")
    ResponseEntity<Void> cancel(@PathVariable String changeId,HttpServletRequest request) {
        AuthController.noBody(request);UUID id=LocationRequests.id(changeId,"PATH","changeId");var selected=policy.select(request);String csrf=csrf(request,selected);
        if(!request.getParameterMap().keySet().equals(Set.of("expectedRevision"))) { throw new AuthHttpFailure(422,"VALIDATION_FAILED"); }
        String[] values=request.getParameterValues("expectedRevision");
        if(values==null || values.length!=1 || values[0].isBlank() || values[0].length()>256) { throw new AuthHttpFailure(422,"VALIDATION_FAILED"); }
        emails.cancel(selected.secret(),selected.transport(),csrf,id,values[0]);return ResponseEntity.noContent().build();
    }
    @PostMapping("/email-change-proofs")
    PasswordController.Acknowledgement verify(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);
        if(request.getHeaders("Authorization").hasMoreElements()) { throw new SessionTransportPolicy.AmbiguousTransport(); }
        if(request.getHeader("Origin")!=null) { policy.requireBrowserOrigin(request); }
        var body=AuthRequests.object(request,Set.of("token"));String token=string(body,"token");
        if(!token.matches("[A-Za-z0-9_-]{43}")) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/token"); }
        emails.verify(token,request.getRemoteAddr());return new PasswordController.Acknowledgement(true);
    }
    @PostMapping("/email-changes/{changeId}/completion")
    ResponseEntity<Result> complete(@PathVariable String changeId,HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);UUID id=LocationRequests.id(changeId,"PATH","changeId");var selected=policy.select(request);String csrf=csrf(request,selected);
        String revision=ContactRequests.revisionCommand(request);
        var completed=emails.complete(selected.secret(),selected.transport(),csrf,id,revision);var response=ResponseEntity.ok();
        if(!completed.replay() && selected.transport()==SessionTransport.BROWSER) { response.header("Set-Cookie",policy.clearCookie().toString()); }
        return response.body(result(completed.change()));
    }
    private static String string(tools.jackson.databind.JsonNode body,String name) {
        if(!body.path(name).isString()) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/"+name); }return body.path(name).asString();
    }
    private static String csrf(HttpServletRequest request,SessionTransportPolicy.Selected selected) { return selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null; }
    private static Result result(EmailChangeService.View v) { return new Result(v.id(),v.revision(),v.state(),AccountResponses.time(v.expiresAt()),v.oldAddressVerified(),v.newAddressVerified()); }
    record Result(UUID id,String revision,String state,String expiresAt,boolean oldAddressVerified,boolean newAddressVerified) { }
}
