package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.application.LoginInput;
import com.narudzbine.identity.application.PasswordLifecycleService;
import com.narudzbine.identity.application.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class PasswordController {
    private final PasswordLifecycleService passwords;
    private final SessionTransportPolicy policy;
    private final SessionService sessions;
    private final AccountResponses responses;
    private final TransactionTemplate transaction;
    PasswordController(PasswordLifecycleService passwords,SessionTransportPolicy policy,SessionService sessions,
            AccountResponses responses,PlatformTransactionManager manager) {
        this.passwords=passwords;this.policy=policy;this.sessions=sessions;this.responses=responses;
        transaction=new TransactionTemplate(manager);transaction.setTimeout(10);
    }
    @PostMapping("/password-reset-requests")
    @ResponseStatus(HttpStatus.ACCEPTED)
    Acknowledgement requestReset(HttpServletRequest request) throws IOException {
        publicRequest(request);
        var body=AuthRequests.object(request,Set.of("email"));
        String email=required(body,"email");
        try { LoginInput.email(email); } catch(IllegalArgumentException exception) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/email"); }
        passwords.requestReset(email,request.getRemoteAddr());return new Acknowledgement(true);
    }
    @PostMapping("/password-resets")
    Acknowledgement reset(HttpServletRequest request) throws IOException {
        publicRequest(request);
        var body=AuthRequests.object(request,Set.of("token","newPassword"));
        String token=required(body,"token");
        if(!token.matches("[A-Za-z0-9_-]{43}")) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/token"); }
        passwords.reset(token,password(body),request.getRemoteAddr());return new Acknowledgement(true);
    }
    @PostMapping("/password-changes")
    AuthController.Result change(HttpServletRequest request,HttpServletResponse response) throws IOException {
        AuthController.noQuery(request);var selected=policy.select(request);
        String csrf=selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null;
        String password=password(AuthRequests.object(request,Set.of("newPassword")));
        var credentials=passwords.change(selected.secret(),selected.transport(),csrf,password);
        var result=transaction.execute(status -> {
            var principal=sessions.authenticate(credentials.secret(),selected.transport());
            return new AuthController.Result(responses.account(principal.accountId()),AccountResponses.session(credentials.session()),
                    selected.transport()==SessionTransport.NATIVE?credentials.secret():null,credentials.csrfToken());
        });
        if(selected.transport()==SessionTransport.BROWSER) { response.addHeader("Set-Cookie",policy.sessionCookie(credentials.secret()).toString()); }
        return result;
    }
    private void publicRequest(HttpServletRequest request) {
        AuthController.noQuery(request);
        if(request.getHeaders("Authorization").hasMoreElements()) { throw new SessionTransportPolicy.AmbiguousTransport(); }
        // Public email/token authority is independent of any session cookie. Reject foreign browser origins.
        if(request.getHeader("Origin")!=null) { policy.requireBrowserOrigin(request); }
    }
    private static String required(tools.jackson.databind.JsonNode body,String field) {
        if(!body.path(field).isString()) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/"+field); }
        return body.path(field).asString();
    }
    private static String password(tools.jackson.databind.JsonNode body) {
        String value=required(body,"newPassword");
        try { LoginInput.password(value); } catch(IllegalArgumentException exception) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/newPassword"); }
        return value;
    }
    record Acknowledgement(boolean accepted) { }
}
