package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.*;
import com.narudzbine.identity.api.ExternalIdentityProvider.*;
import com.narudzbine.identity.application.ExternalFlowService;
import com.narudzbine.identity.application.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@ConditionalOnProperty(name={"identity.http.enabled","identity.external.http.enabled"},havingValue="true")
public final class ExternalController {
    static final String FLOW_COOKIE="__Host-narudzbine_oidc";
    private final ExternalFlowService flows;
    private final SessionTransportPolicy policy;
    private final AccountResponses responses;
    private final SessionService sessions;
    private final TransactionTemplate tx;
    ExternalController(ExternalFlowService flows,SessionTransportPolicy policy,AccountResponses responses,SessionService sessions,PlatformTransactionManager manager) {
        this.flows=flows;this.policy=policy;this.responses=responses;this.sessions=sessions;tx=new TransactionTemplate(manager);tx.setTimeout(10);
    }
    @PostMapping("/external/challenges")
    Challenge start(HttpServletRequest request,HttpServletResponse response) throws IOException {
        AuthController.noQuery(request);var body=AuthRequests.object(request,Set.of("provider","purpose","transport","returnTarget","codeChallenge"));
        Provider provider=enumeration(body,"provider",Provider.class);Purpose purpose=enumeration(body,"purpose",Purpose.class);SessionTransport transport=enumeration(body,"transport",SessionTransport.class);
        String target=string(body,"returnTarget"),challenge=null;
        if(!body.has("codeChallenge") || (!body.path("codeChallenge").isNull() && !body.path("codeChallenge").isString())) { throw validation("codeChallenge"); }
        if(body.path("codeChallenge").isString()) { challenge=body.path("codeChallenge").asString(); }
        String token=null,csrf=null;
        if(purpose==Purpose.LOGIN) {
            if(request.getHeaders("Authorization").hasMoreElements()) { throw new SessionTransportPolicy.AmbiguousTransport(); }
            if(transport==SessionTransport.BROWSER) { policy.requireBrowserOrigin(request); } else { policy.requireNativeOrigin(request);if(cookie(request,SessionTransportPolicy.COOKIE_NAME)!=null) { throw new SessionTransportPolicy.AmbiguousTransport(); } }
        } else {
            var selected=policy.select(request);if(selected.transport()!=transport) { throw new SessionTransportPolicy.AmbiguousTransport(); }
            token=selected.secret();if(transport==SessionTransport.BROWSER) { csrf=AuthController.csrfHeader(request); }
        }
        var started=flows.start(provider,purpose,transport,target,challenge,token,csrf,request.getRemoteAddr());
        if(started.browserBinding()!=null) { response.addHeader("Set-Cookie",flowCookie(started.browserBinding(),300).toString()); }
        return new Challenge(started.authorizationUrl(),AccountResponses.time(started.expiresAt()));
    }
    @RequestMapping(value="/external/{provider}/callback",method={RequestMethod.GET,RequestMethod.POST})
    ResponseEntity<Void> callback(@PathVariable String provider,HttpServletRequest request) throws IOException {
        Provider selected;try { selected=Provider.valueOf(provider); } catch(IllegalArgumentException e) { throw new AuthHttpFailure(422,"VALIDATION_FAILED"); }
        if(request.getHeaders("Authorization").hasMoreElements()) { throw new SessionTransportPolicy.AmbiguousTransport(); }
        Map<String,String> input;
        if(request.getMethod().equals("GET")) {
            AuthController.noBody(request);input=new HashMap<>();
            for(var entry:request.getParameterMap().entrySet()) { if(entry.getValue().length!=1) { throw new AuthHttpFailure(422,"VALIDATION_FAILED"); }input.put(entry.getKey(),entry.getValue()[0]); }
        } else {
            AuthController.noQuery(request);
            if(request.getContentType()==null || !request.getContentType().split(";",2)[0].strip().equalsIgnoreCase("application/x-www-form-urlencoded")) { throw new AuthHttpFailure(415,"UNSUPPORTED_MEDIA_TYPE"); }
            byte[] bytes=request.getInputStream().readNBytes(16385);if(bytes.length>16384) { throw new AuthHttpFailure(413,"PAYLOAD_TOO_LARGE"); }
            input=new HashMap<>();
            try { for(String part:new String(bytes,StandardCharsets.UTF_8).split("&",-1)) {
                String[] pair=part.split("=",2);if(pair.length!=2 || input.putIfAbsent(URLDecoder.decode(pair[0],StandardCharsets.UTF_8),URLDecoder.decode(pair[1],StandardCharsets.UTF_8))!=null) { throw new IllegalArgumentException(); }
            } } catch(IllegalArgumentException e) { throw new AuthHttpFailure(400,"MALFORMED_REQUEST"); }
        }
        if(!Set.of("code","state","user","error","error_description","iss").containsAll(input.keySet()) || input.get("state")==null
                || !input.get("state").matches("[A-Za-z0-9_-]{43}") || input.containsKey("code")==input.containsKey("error")
                || (input.containsKey("code") && (input.get("code").isBlank() || input.get("code").length()>4096))
                || input.getOrDefault("user","").length()>8192 || input.getOrDefault("error","").length()>256
                || input.getOrDefault("error_description","").length()>1024 || input.getOrDefault("iss","").length()>512) { throw new AuthHttpFailure(422,"VALIDATION_FAILED"); }
        // user/email hints are deliberately ignored; signed issuer/subject comes only from the OIDC boundary.
        var result=flows.callback(selected,request.getMethod(),input.get("state"),input.get("code"),cookie(request,FLOW_COOKIE),input.containsKey("error"),request.getRemoteAddr());
        var response=ResponseEntity.status(303).header("Location",result.location()).header("Referrer-Policy","no-referrer");
        if(result.transport()==SessionTransport.BROWSER) {
            response.header("Set-Cookie",policy.sessionCookie(result.credentials().secret()).toString());response.header("Set-Cookie",flowCookie("",0).toString());
        }
        return response.build();
    }
    @PostMapping("/external/exchanges")
    AuthController.Result exchange(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);policy.requireNativeOrigin(request);
        if(request.getHeaders("Authorization").hasMoreElements() || cookie(request,SessionTransportPolicy.COOKIE_NAME)!=null || cookie(request,FLOW_COOKIE)!=null) { throw new SessionTransportPolicy.AmbiguousTransport(); }
        var body=AuthRequests.object(request,Set.of("code","codeVerifier"));String code=string(body,"code"),verifier=string(body,"codeVerifier");
        if(!code.matches("[A-Za-z0-9_-]{43}")) { throw validation("code"); }
        try { com.narudzbine.identity.application.ExternalSecrets.verifier(verifier); } catch(IllegalArgumentException e) { throw validation("codeVerifier"); }
        var credentials=flows.exchange(code,verifier,request.getRemoteAddr());
        return tx.execute(status -> {
            var principal=sessions.authenticate(credentials.secret(),SessionTransport.NATIVE);
            return new AuthController.Result(responses.account(principal.accountId()),AccountResponses.session(credentials.session()),credentials.secret(),null);
        });
    }
    @GetMapping("/external-identities")
    Page list(HttpServletRequest request) {
        AuthController.noBody(request);var selected=policy.select(request);
        if(!Set.of("page","size","includeTotal").containsAll(request.getParameterMap().keySet()) || request.getParameterMap().values().stream().anyMatch(v->v.length!=1)) { throw new AuthHttpFailure(422,"VALIDATION_FAILED"); }
        int page=number(request,"page",0,0,10000),size=number(request,"size",25,1,100);String total=request.getParameter("includeTotal");
        if(total!=null && !Set.of("true","false").contains(total)) { throw new AuthHttpFailure(422,"VALIDATION_FAILED"); }
        var result=flows.list(selected.secret(),selected.transport(),page,size,"true".equals(total));
        return new Page(result.items().stream().map(v->new Identity(v.id(),v.provider(),AccountResponses.time(v.createdAt()))).toList(),page,size,result.total());
    }
    @DeleteMapping("/external-identities/{identityId}")
    ResponseEntity<Void> unlink(@PathVariable String identityId,HttpServletRequest request) {
        AuthController.noQuery(request);AuthController.noBody(request);UUID id=LocationRequests.id(identityId,"PATH","identityId");var selected=policy.select(request);
        boolean changed=flows.unlink(selected.secret(),selected.transport(),selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null,id);
        var response=ResponseEntity.noContent();if(changed && selected.transport()==SessionTransport.BROWSER) { response.header("Set-Cookie",policy.clearCookie().toString()); }return response.build();
    }
    private static String cookie(HttpServletRequest r,String name) { String value=null;int count=0;if(r.getCookies()!=null) { for(var c:r.getCookies()) { if(c.getName().equals(name)) { value=c.getValue();count++; } } }if(count>1) { throw new SessionTransportPolicy.AmbiguousTransport(); }return value; }
    private static ResponseCookie flowCookie(String value,int maxAge) { return ResponseCookie.from(FLOW_COOKIE,value).secure(true).httpOnly(true).sameSite("None").path("/").maxAge(maxAge).build(); }
    private static String string(tools.jackson.databind.JsonNode body,String key) { if(!body.path(key).isString()) { throw validation(key); }return body.path(key).asString(); }
    private static <T extends Enum<T>> T enumeration(tools.jackson.databind.JsonNode body,String key,Class<T> type) { try { return Enum.valueOf(type,string(body,key)); } catch(IllegalArgumentException e) { throw validation(key); } }
    private static AuthHttpFailure validation(String field) { return new AuthHttpFailure(422,"VALIDATION_FAILED","/"+field); }
    private static int number(HttpServletRequest r,String name,int fallback,int min,int max) { String value=r.getParameter(name);if(value==null) { return fallback; }try { if(!value.matches("0|[1-9][0-9]{0,5}")) { throw new IllegalArgumentException(); }int n=Integer.parseInt(value);if(n<min || n>max) { throw new IllegalArgumentException(); }return n; } catch(IllegalArgumentException e) { throw new AuthHttpFailure(422,"VALIDATION_FAILED"); } }
    record Challenge(String authorizationUrl,String expiresAt) { @Override public String toString() { return "ExternalChallenge[redacted]"; } }
    record Identity(UUID id,String provider,String createdAt) { }
    record Page(List<Identity> items,int page,int size,Integer total) { }
}
