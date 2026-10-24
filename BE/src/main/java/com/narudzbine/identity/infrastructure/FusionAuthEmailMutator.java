package com.narudzbine.identity.infrastructure;

import com.narudzbine.identity.api.EmailCredentialMutator;
import com.narudzbine.identity.api.PasswordCredentialVerifier.Subject;
import java.net.URI;
import java.net.http.HttpRequest;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

/** G-02-gated email PATCH, administrative verification and positive read-only reconciliation. */
public final class FusionAuthEmailMutator implements EmailCredentialMutator {
    private final URI endpoint;
    private final UUID tenant;
    private final String key;
    private final FusionAuthPasswordVerifier.Exchange exchange;
    private final JsonMapper json=JsonMapper.builder().build();
    public FusionAuthEmailMutator(URI endpoint,UUID tenant,String key) { this(endpoint,tenant,key,new FusionAuthPasswordVerifier.HttpExchange()); }
    FusionAuthEmailMutator(URI endpoint,UUID tenant,String key,FusionAuthPasswordVerifier.Exchange exchange) {
        if(endpoint==null || !"https".equals(endpoint.getScheme()) || endpoint.getHost()==null || endpoint.getUserInfo()!=null
                || !"/api/login".equals(endpoint.getPath()) || endpoint.getQuery()!=null || endpoint.getFragment()!=null
                || tenant==null || key==null || key.isBlank() || key.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("Explicit HTTPS provider endpoint, tenant and key are required.");
        }
        this.endpoint=endpoint;this.tenant=tenant;this.key=key;this.exchange=exchange;
    }
    @Override public Outcome change(Subject subject,UUID operation,String oldEmail,String newEmail) {
        if(!tenant.equals(subject.tenantId())) { return Outcome.REJECTED; }
        try {
            var patch=exchange.send(request("/api/user/"+subject.userId()).method("PATCH",HttpRequest.BodyPublishers.ofByteArray(
                    json.writeValueAsBytes(Map.of("user",Map.of("email",newEmail,"data",Map.of("narudzbineEmailOperation",operation.toString())))))).build());
            if(patch.status()==400 || patch.status()==401 || patch.status()==403 || patch.status()==404) { return Outcome.REJECTED; }
            if(patch.status()!=200 || !confirms(patch,subject,operation,oldEmail,newEmail,false)) { return Outcome.UNKNOWN; }
            // Both local mailbox proofs are already committed; no provider-generated verification link is used.
            var verified=exchange.send(request("/api/user/verify-email").POST(HttpRequest.BodyPublishers.ofByteArray(
                    json.writeValueAsBytes(Map.of("userId",subject.userId().toString())))).build());
            if(verified.status()!=200 || verified.body().length>65536) { return Outcome.UNKNOWN; }
            return reconcile(subject,operation,oldEmail,newEmail);
        } catch(InterruptedException ex) { Thread.currentThread().interrupt();return Outcome.UNKNOWN;
        } catch(Exception ex) { return Outcome.UNKNOWN; }
    }
    @Override public Outcome reconcile(Subject subject,UUID operation,String oldEmail,String newEmail) {
        if(!tenant.equals(subject.tenantId())) { return Outcome.UNKNOWN; }
        try {
            var reply=exchange.send(request("/api/user/"+subject.userId()).GET().build());
            return reply.status()==200 && confirms(reply,subject,operation,oldEmail,newEmail,true)?Outcome.APPLIED:Outcome.UNKNOWN;
        } catch(InterruptedException ex) { Thread.currentThread().interrupt();return Outcome.UNKNOWN;
        } catch(Exception ex) { return Outcome.UNKNOWN; }
    }
    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(endpoint.resolve(path)).timeout(Duration.ofSeconds(5)).header("Authorization",key)
                .header("X-FusionAuth-TenantId",tenant.toString()).header("Content-Type","application/json").header("Accept","application/json");
    }
    private boolean confirms(FusionAuthPasswordVerifier.Reply reply,Subject subject,UUID operation,String oldEmail,String next,boolean verified) {
        if(reply.body().length>65536) { return false; }var user=json.readTree(reply.body()).path("user");
        if(!subject.userId().toString().equals(user.path("id").asString()) || !tenant.toString().equals(user.path("tenantId").asString())
                || !operation.toString().equals(user.path("data").path("narudzbineEmailOperation").asString())
                || !next.equals(user.path("email").asString("").toLowerCase(Locale.ROOT))) { return false; }
        if(user.has("identities")) {
            if(!user.path("identities").isArray()) { return false; }boolean primary=false;
            for(var identity:user.path("identities")) {
                if(!identity.path("type").asString().equals("email")) { continue; }
                String address=identity.path("value").asString("").toLowerCase(Locale.ROOT);
                if(address.equals(oldEmail)) { return false; }
                if(address.equals(next) && identity.path("primary").asBoolean(false)
                        && (!verified || identity.path("verified").asBoolean(false))) { primary=true; }
            }
            return primary;
        }
        return !verified || user.path("verified").asBoolean(false);
    }
}
