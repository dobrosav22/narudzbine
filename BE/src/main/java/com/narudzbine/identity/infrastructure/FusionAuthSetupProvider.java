package com.narudzbine.identity.infrastructure;

import com.narudzbine.identity.api.SetupCredentialProvider;
import com.narudzbine.identity.api.PasswordCredentialVerifier.Subject;
import java.net.URI;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

/** One combined create, never retried. G-02 must prove atomicity, password policy and protected marker semantics. */
public final class FusionAuthSetupProvider implements SetupCredentialProvider {
    private final URI endpoint;
    private final UUID tenant,application;
    private final String key;
    private final FusionAuthPasswordVerifier.Exchange exchange;
    private final JsonMapper json=JsonMapper.builder().build();
    public FusionAuthSetupProvider(URI endpoint,UUID tenant,UUID application,String key){this(endpoint,tenant,application,key,new FusionAuthPasswordVerifier.HttpExchange());}
    FusionAuthSetupProvider(URI endpoint,UUID tenant,UUID application,String key,FusionAuthPasswordVerifier.Exchange exchange){
        if(endpoint==null||!"https".equals(endpoint.getScheme())||endpoint.getHost()==null||endpoint.getUserInfo()!=null||endpoint.getQuery()!=null||endpoint.getFragment()!=null||!endpoint.getPath().equals("/api/login")||tenant==null||application==null||key==null||key.isBlank()||key.chars().anyMatch(Character::isISOControl)){throw new IllegalArgumentException("Explicit isolated HTTPS setup provider configuration required.");}
        this.endpoint=endpoint;this.tenant=tenant;this.application=application;this.key=key;this.exchange=exchange;
    }
    @Override public UUID tenant(){return tenant;}
    @Override public Outcome create(Subject candidate,UUID operation,String email,String password){
        if(!tenant.equals(candidate.tenantId())){return Outcome.UNKNOWN;}
        try {
            byte[] body=json.writeValueAsBytes(Map.of("user",Map.of("email",email,"password",password,"verified",true,"data",Map.of("narudzbineSetupOperation",operation.toString())),
                    "registration",Map.of("applicationId",application.toString()),"skipVerification",true,"skipRegistrationVerification",true,"sendSetPasswordIdentityType","doNotSend"));
            var reply=exchange.send(request("/api/user/registration/"+candidate.userId()).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofByteArray(body)).build());
            if(reply.body().length>65536){return Outcome.UNKNOWN;}
            if(reply.status()==200){return confirms(reply,candidate,operation,email)?Outcome.APPLIED:Outcome.UNKNOWN;}
            if(reply.status()==400&&json.readTree(reply.body()).path("fieldErrors").path("user.password").isArray()
                    &&json.readTree(reply.body()).path("fieldErrors").path("user.password").size()>0){return Outcome.POLICY_REJECTED;}
            return Outcome.UNKNOWN;
        }catch(InterruptedException ex){Thread.currentThread().interrupt();return Outcome.UNKNOWN;}catch(Exception ex){return Outcome.UNKNOWN;}
    }
    @Override public Outcome reconcile(Subject candidate,UUID operation,String email){
        if(!tenant.equals(candidate.tenantId())){return Outcome.UNKNOWN;}
        try {var reply=exchange.send(request("/api/user/"+candidate.userId()).GET().build());return reply.status()==200&&reply.body().length<=65536&&confirms(reply,candidate,operation,email)?Outcome.APPLIED:Outcome.UNKNOWN;}
        catch(InterruptedException ex){Thread.currentThread().interrupt();return Outcome.UNKNOWN;}catch(Exception ex){return Outcome.UNKNOWN;}
    }
    private boolean confirms(FusionAuthPasswordVerifier.Reply reply,Subject candidate,UUID operation,String email){
        var root=json.readTree(reply.body());if(root.has("token")||root.has("refreshToken")||root.has("verificationId")||root.has("verificationIds")){return false;}
        var user=root.path("user");if(!candidate.userId().toString().equals(user.path("id").asString())||!tenant.toString().equals(user.path("tenantId").asString())||!email.equals(user.path("email").asString())
                ||!user.path("active").asBoolean(false)||!user.path("verified").asBoolean(false)||user.path("passwordChangeRequired").asBoolean(false)||!operation.toString().equals(user.path("data").path("narudzbineSetupOperation").asString())){return false;}
        var registration=root.path("registration");if(application.toString().equals(registration.path("applicationId").asString())&&registration.path("verified").asBoolean(false)){return true;}
        for(var r:user.path("registrations")){if(application.toString().equals(r.path("applicationId").asString())&&r.path("verified").asBoolean(false)){return true;}}return false;
    }
    private HttpRequest.Builder request(String path){return HttpRequest.newBuilder(endpoint.resolve(path)).timeout(Duration.ofSeconds(5)).header("Authorization",key).header("X-FusionAuth-TenantId",tenant.toString()).header("Accept","application/json");}
    @Override public String toString(){return "FusionAuthSetupProvider[redacted]";}
}
