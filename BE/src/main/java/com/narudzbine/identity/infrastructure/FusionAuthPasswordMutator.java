package com.narudzbine.identity.infrastructure;

import com.narudzbine.identity.api.PasswordCredentialMutator;
import com.narudzbine.identity.api.PasswordCredentialVerifier;
import java.net.URI;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

/** Requires G-02 conformance for atomic marker/password updates and the configured tenant password policy. */
public final class FusionAuthPasswordMutator implements PasswordCredentialMutator {
    private final URI endpoint;
    private final UUID tenant;
    private final String key;
    private final FusionAuthPasswordVerifier.Exchange exchange;
    private final JsonMapper json=JsonMapper.builder().build();
    public FusionAuthPasswordMutator(URI endpoint,UUID tenant,String key) {
        this(endpoint,tenant,key,new FusionAuthPasswordVerifier.HttpExchange());
    }
    FusionAuthPasswordMutator(URI endpoint,UUID tenant,String key,FusionAuthPasswordVerifier.Exchange exchange) {
        if(endpoint==null || !"https".equals(endpoint.getScheme()) || endpoint.getHost()==null || endpoint.getUserInfo()!=null
                || !"/api/login".equals(endpoint.getPath()) || endpoint.getQuery()!=null || endpoint.getFragment()!=null
                || tenant==null || key==null || key.isBlank() || key.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("Explicit HTTPS provider endpoint, tenant and key are required.");
        }
        this.endpoint=endpoint;this.tenant=tenant;this.key=key;this.exchange=exchange;
    }
    @Override public Outcome change(PasswordCredentialVerifier.Subject subject,UUID operation,String password) {
        if(!tenant.equals(subject.tenantId())) { return Outcome.REJECTED; }
        try {
            byte[] payload=json.writeValueAsBytes(Map.of("user",Map.of("password",password,
                    "data",Map.of("narudzbinePasswordOperation",operation.toString()))));
            var request=request(subject).header("Content-Type","application/json")
                    .method("PATCH",HttpRequest.BodyPublishers.ofByteArray(payload)).build();
            var reply=exchange.send(request);
            if(reply.body().length>65536) { return Outcome.UNKNOWN; }
            if(reply.status()==200) { return confirms(reply,subject,operation)?Outcome.APPLIED:Outcome.UNKNOWN; }
            if(reply.status()==400) {
                var errors=json.readTree(reply.body()).path("fieldErrors").path("user.password");
                return errors.isArray() && errors.size()>0?Outcome.POLICY_REJECTED:Outcome.REJECTED;
            }
            if(reply.status()==401 || reply.status()==403 || reply.status()==404) { return Outcome.REJECTED; }
            return Outcome.UNKNOWN;
        } catch(InterruptedException exception) { Thread.currentThread().interrupt();return Outcome.UNKNOWN;
        } catch(Exception exception) { return Outcome.UNKNOWN; }
    }
    @Override public Outcome reconcile(PasswordCredentialVerifier.Subject subject,UUID operation) {
        if(!tenant.equals(subject.tenantId())) { return Outcome.UNKNOWN; }
        try {
            var reply=exchange.send(request(subject).GET().build());
            return reply.status()==200 && reply.body().length<=65536 && confirms(reply,subject,operation)?Outcome.APPLIED:Outcome.UNKNOWN;
        } catch(InterruptedException exception) { Thread.currentThread().interrupt();return Outcome.UNKNOWN;
        } catch(Exception exception) { return Outcome.UNKNOWN; }
    }
    private HttpRequest.Builder request(PasswordCredentialVerifier.Subject subject) {
        return HttpRequest.newBuilder(endpoint.resolve("/api/user/"+subject.userId())).timeout(Duration.ofSeconds(5))
                .header("Authorization",key).header("X-FusionAuth-TenantId",tenant.toString()).header("Accept","application/json");
    }
    private boolean confirms(FusionAuthPasswordVerifier.Reply reply,PasswordCredentialVerifier.Subject subject,UUID operation) {
        var user=json.readTree(reply.body()).path("user");
        return subject.userId().toString().equals(user.path("id").asString()) && tenant.toString().equals(user.path("tenantId").asString())
                && operation.toString().equals(user.path("data").path("narudzbinePasswordOperation").asString());
    }
}
