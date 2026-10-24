package com.narudzbine.identity.application;

import com.narudzbine.audit.api.ExternalAudit;
import com.narudzbine.audit.api.TransferAudit;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.api.ExternalIdentityProvider.*;
import com.narudzbine.organizations.api.MembershipAccess;
import com.narudzbine.shared.api.UuidGenerator;
import java.net.URI;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** One-use external proof orchestration. All provider calls occur outside database transactions. */
public final class ExternalFlowService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final ExternalIdentityProvider provider;
    private final ExternalSecrets secrets;
    private final LoginThrottle throttle;
    private final ExternalAudit audit;
    private final TransferAudit transfers;
    private final UuidGenerator ids;
    private final Clock clock;
    private final Map<String,URI> targets;
    public ExternalFlowService(JdbcTemplate jdbc,PlatformTransactionManager manager,SessionService sessions,MembershipAccess memberships,
            ExternalIdentityProvider provider,ExternalSecrets secrets,LoginThrottle throttle,ExternalAudit audit,TransferAudit transfers,
            UuidGenerator ids,Clock clock,Map<String,URI> targets) {
        this.jdbc=jdbc;tx=new TransactionTemplate(manager);tx.setTimeout(10);this.sessions=sessions;this.memberships=memberships;
        this.provider=provider;this.secrets=secrets;this.throttle=throttle;this.audit=audit;this.transfers=transfers;this.ids=ids;this.clock=clock;
        if(!targets.keySet().equals(Set.of("WEB","ANDROID","IOS"))) { throw new IllegalArgumentException("All exact return targets required."); }
        for(URI target:targets.values()) { if(!"https".equals(target.getScheme()) || target.getHost()==null || target.getUserInfo()!=null || target.getQuery()!=null || target.getFragment()!=null) { throw new IllegalArgumentException("Exact HTTPS return targets required."); } }
        this.targets=Map.copyOf(targets);
    }
    public StartResult start(Provider selected,Purpose purpose,SessionTransport transport,String target,String nativeChallenge,
            String token,String csrf,String source) {
        LoginThrottle.requireNoTransaction();
        if(!targets.containsKey(target) || (transport==SessionTransport.BROWSER && (!target.equals("WEB") || nativeChallenge!=null))
                || (transport==SessionTransport.NATIVE && (target.equals("WEB") || nativeChallenge==null || !nativeChallenge.matches("[A-Za-z0-9_-]{43}")))) {
            throw new IllegalArgumentException("Invalid external transport/return target/PKCE combination.");
        }
        throttle.begin("external-start",source);
        UUID id=ids.next();String state=SessionSecrets.generate(),verifier=SessionSecrets.generate();String binding=transport==SessionTransport.BROWSER?SessionSecrets.generate():null;
        String authorization=provider.authorization(selected,purpose,state,verifier,ExternalSecrets.nonce(verifier));
        Instant expiry=tx.execute(status -> {
            Account a=null;UUID session=null;
            if(purpose!=Purpose.LOGIN) {
                var principal=sessions.authenticateForProfileWrite(token,transport);if(transport==SessionTransport.BROWSER) { sessions.requireCsrf(token,csrf); }
                if(purpose==Purpose.LINK) { fresh(principal); }a=account(principal.accountId());session=principal.sessionId();
            }
            Instant now=now();
            jdbc.update("""
                    INSERT INTO external_challenge(id,state_hash,provider,purpose,transport,return_target,native_challenge,browser_binding_hash,
                    encrypted_verifier,account_id,original_session_id,original_token_hash,security_epoch,credential_generation,state,created_at,expires_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'OPEN',?,?)
                    """,id,SessionSecrets.hash(state),selected.name(),purpose.name(),transport.name(),target,nativeChallenge,
                    binding==null?null:SessionSecrets.hash(binding),secrets.encrypt(id,verifier),a==null?null:a.id(),session,
                    a==null?null:SessionSecrets.hash(token),a==null?null:a.epoch(),a==null?null:a.generation(),time(now),time(now.plusSeconds(300)));
            return now.plusSeconds(300);
        });
        return new StartResult(authorization,expiry,binding);
    }
    public CallbackResult callback(Provider selected,String method,String state,String code,String binding,boolean denied,String source) {
        LoginThrottle.requireNoTransaction();throttle.begin("external-callback",source);
        byte[] stateHash=hash(state);
        Flow flow=tx.execute(status -> {
            var rows=jdbc.query("SELECT * FROM external_challenge WHERE state_hash=? FOR UPDATE",ExternalFlowService::map,stateHash);
            if(rows.isEmpty()) { throw invalid(); }Flow f=rows.getFirst();
            if(f.encrypted()==null || f.provider()!=selected || !f.state().equals("OPEN") || !now().isBefore(f.expires())
                    || !method.equals(selected==Provider.APPLE?"POST":"GET")) { throw invalid(); }
            if(f.transport()==SessionTransport.BROWSER && !MessageDigest.isEqual(f.browserHash(),hash(binding))) { throw invalid(); }
            if(f.transport()==SessionTransport.NATIVE && binding!=null) { throw invalid(); }
            jdbc.update("UPDATE external_challenge SET state='CLAIMED' WHERE id=?",f.id());return f;
        });
        if(denied) { throw new InvalidLogin(); }
        String verifier=secrets.decrypt(flow.id(),flow.encrypted());
        Subject subject=provider.verify(selected,flow.purpose(),state,code,verifier,ExternalSecrets.nonce(verifier),flow.created());
        if(subject==null || subject.issuer()==null || subject.issuer().length()>512 || subject.subject()==null || subject.subject().isBlank() || subject.subject().length()>255) { throw new InvalidLogin(); }
        Instant proofTime=now();
        return tx.execute(status -> {
            if(!now().isBefore(flow.expires())) { throw invalid(); }
            Account a=resolve(flow,subject);SessionCredentials credentials=null;String exchangeCode=null;
            if(flow.transport()==SessionTransport.BROWSER) { credentials=apply(flow,a,subject,proofTime); }
            else {
                UUID identity=flow.purpose()==Purpose.LINK?null:identity(subject).map(Identity::id).orElse(null);
                if(flow.purpose()!=Purpose.LINK && identity==null) { throw new InvalidLogin(); }
                exchangeCode=SessionSecrets.generate();
                jdbc.update("""
                        INSERT INTO external_exchange(code_hash,challenge_id,account_id,identity_id,issuer,subject,security_epoch,credential_generation,authenticated_at,expires_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?)
                        """,SessionSecrets.hash(exchangeCode),flow.id(),a.id(),identity,subject.issuer(),subject.subject(),a.epoch(),a.generation(),time(proofTime),time(proofTime.plusSeconds(60)));
            }
            jdbc.update("UPDATE external_challenge SET state='COMPLETED' WHERE id=?",flow.id());
            String location=targets.get(flow.target()).toString();if(exchangeCode!=null) { location+="?code="+exchangeCode+"&state="+state; }
            return new CallbackResult(location,credentials,flow.transport());
        });
    }
    public SessionCredentials exchange(String code,String verifier,String source) {
        LoginThrottle.requireNoTransaction();ExternalSecrets.verifier(verifier);throttle.begin("external-exchange",source);byte[] hash=hash(code);
        var accounts=jdbc.queryForList("SELECT account_id FROM external_exchange WHERE code_hash=?",UUID.class,hash);
        if(accounts.isEmpty()) { throw invalid(); }
        return tx.execute(status -> {
            Account a=account(accounts.getFirst());
            var rows=jdbc.queryForList("SELECT * FROM external_exchange WHERE code_hash=? FOR UPDATE",hash);
            if(rows.isEmpty()) { throw invalid(); }var e=rows.getFirst();
            Flow flow=jdbc.queryForObject("SELECT * FROM external_challenge WHERE id=?",ExternalFlowService::map,e.get("challenge_id"));
            if(flow.encrypted()==null || flow.nativeChallenge()==null || e.get("consumed_at")!=null || !now().isBefore(((Timestamp)e.get("expires_at")).toInstant())
                    || a.epoch()!=((Number)e.get("security_epoch")).longValue() || a.generation()!=((Number)e.get("credential_generation")).longValue()
                    || !MessageDigest.isEqual(ExternalSecrets.challenge(verifier).getBytes(java.nio.charset.StandardCharsets.US_ASCII),flow.nativeChallenge().getBytes(java.nio.charset.StandardCharsets.US_ASCII))) { throw invalid(); }
            var subject=new Subject((String)e.get("issuer"),(String)e.get("subject"));
            SessionCredentials result=apply(flow,a,subject,((Timestamp)e.get("authenticated_at")).toInstant());
            jdbc.update("UPDATE external_exchange SET consumed_at=? WHERE code_hash=?",time(now()),hash);return result;
        });
    }
    private Account resolve(Flow flow,Subject subject) {
        if(flow.purpose()==Purpose.LOGIN) {
            var identity=identity(subject).filter(i->i.active() && i.provider()==flow.provider()).orElseThrow(InvalidLogin::new);
            try { return account(identity.account()); } catch(InvalidSession e) { throw new InvalidLogin(); }
        }
        Account a=account(flow.account());
        if(a.epoch()!=flow.epoch() || a.generation()!=flow.generation()) { throw new InvalidSession(); }
        var current=sessions.authenticateExternalContinuation(flow.session(),flow.tokenHash(),flow.transport());
        if(flow.purpose()==Purpose.LINK) { fresh(current); }
        else if(identity(subject).filter(i->i.active() && i.account().equals(a.id()) && i.provider()==flow.provider()).isEmpty()) { throw new InvalidLogin(); }
        return a;
    }
    private SessionCredentials apply(Flow flow,Account a,Subject subject,Instant proofTime) {
        if(proofTime.isAfter(now()) || !now().isBefore(proofTime.plusSeconds(60))) { throw invalid(); }
        if(flow.purpose()!=Purpose.LOGIN) {
            if(a.epoch()!=flow.epoch() || a.generation()!=flow.generation()) { throw new InvalidSession(); }
            var current=sessions.authenticateExternalContinuation(flow.session(),flow.tokenHash(),flow.transport());
            if(flow.purpose()==Purpose.LINK) { fresh(current); }
        }
        Identity binding;
        if(flow.purpose()==Purpose.LINK) {
            jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,16001))",r->{},subject.issuer()+"\n"+subject.subject());
            if(flow.transport()==SessionTransport.BROWSER && !now().isBefore(flow.expires())) { throw invalid(); }
            if(!now().isBefore(proofTime.plusSeconds(60))) { throw invalid(); }
            fresh(sessions.authenticateExternalContinuation(flow.session(),flow.tokenHash(),flow.transport()));
            var existing=identity(subject);
            if(existing.isPresent() && (!existing.get().account().equals(a.id()) || existing.get().provider()!=flow.provider())) { throw fail(ExternalFailure.Reason.IDENTITY_UNAVAILABLE); }
            if(existing.isPresent() && existing.get().active()) { throw fail(ExternalFailure.Reason.INVALID_STATE); }
            UUID id=existing.map(Identity::id).orElseGet(ids::next);
            if(existing.isPresent()) { jdbc.update("UPDATE external_identity SET active=true,updated_at=? WHERE id=?",time(now()),id); }
            else { jdbc.update("INSERT INTO external_identity(id,account_id,provider,issuer,subject,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",id,a.id(),flow.provider().name(),subject.issuer(),subject.subject(),time(now()),time(now())); }
            binding=new Identity(id,a.id(),flow.provider(),true);
        } else { binding=identity(subject).filter(i->i.active() && i.account().equals(a.id()) && i.provider()==flow.provider()).orElseThrow(InvalidLogin::new); }
        var proof=new VerifiedExternalProof(a.id(),a.epoch(),a.generation(),binding.id(),proofTime);
        if(!now().isBefore(proofTime.plusSeconds(60)) || (flow.transport()==SessionTransport.BROWSER && !now().isBefore(flow.expires()))) { throw invalid(); }
        if(flow.purpose()==Purpose.LOGIN) { return sessions.issueExternal(proof,flow.transport(),flow.provider()+" sign-in"); }
        var result=sessions.reauthenticateExternalContinuation(flow.session(),flow.tokenHash(),flow.transport(),proof);
        if(flow.purpose()==Purpose.LINK) {
            changed(a.id(),result.session().id());audit.externalIdentity(a.id(),binding.id(),ExternalAudit.Action.EXTERNAL_IDENTITY_LINKED);
            sessions.recordSuccessfulActivity(result.secret(),flow.transport());
        }
        return result;
    }
    public Page list(String token,SessionTransport transport,int page,int size,boolean includeTotal) {
        LoginThrottle.requireNoTransaction();UUID actor=tx.execute(status->sessions.authenticate(token,transport).accountId());throttle.admitApi(actor,false);
        return tx.execute(status -> {
            sessions.authenticate(token,transport);sessions.recordSuccessfulActivity(token,transport);
            var items=jdbc.query("SELECT id,provider,created_at FROM external_identity WHERE account_id=? AND active ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?",
                    (r,n)->new View(r.getObject(1,UUID.class),r.getString(2),r.getTimestamp(3).toInstant()),actor,size,(long)page*size);
            return new Page(items,page,size,includeTotal?jdbc.queryForObject("SELECT count(*) FROM external_identity WHERE account_id=? AND active",Integer.class,actor):null);
        });
    }
    public boolean unlink(String token,SessionTransport transport,String csrf,UUID id) {
        LoginThrottle.requireNoTransaction();UUID actor=tx.execute(status->sessions.authenticate(token,transport).accountId());throttle.admitApi(actor,true);
        return tx.execute(status -> {
            var principal=sessions.authenticateForProfileWrite(token,transport);if(transport==SessionTransport.BROWSER) { sessions.requireCsrf(token,csrf); }fresh(principal);
            var identities=jdbc.query("SELECT id,account_id,provider,active FROM external_identity WHERE id=? AND account_id=? FOR UPDATE",(r,n)->new Identity(id,actor,Provider.valueOf(r.getString(3)),r.getBoolean(4)),id,actor);
            if(identities.isEmpty()) { throw fail(ExternalFailure.Reason.NOT_FOUND); }
            var method=jdbc.queryForMap("SELECT auth_method_type,auth_method_id FROM application_session WHERE id=?",principal.sessionId());
            boolean retained;
            if(method.get("auth_method_type").equals("PASSWORD")) { retained=jdbc.queryForObject("SELECT count(*) FROM managed_password_identity WHERE account_id=? AND password_usable",Integer.class,actor)==1; }
            else { UUID proof=(UUID)method.get("auth_method_id");retained=!id.equals(proof) && jdbc.queryForObject("SELECT count(*) FROM external_identity WHERE id=? AND account_id=? AND active",Integer.class,proof,actor)==1; }
            if(!retained) { throw fail(ExternalFailure.Reason.RETAINED_METHOD_REQUIRED); }
            if(!identities.getFirst().active()) { return false; }
            fresh(principal);
            jdbc.update("UPDATE external_identity SET active=false,updated_at=? WHERE id=?",time(now()),id);changed(actor,null);
            audit.externalIdentity(actor,id,ExternalAudit.Action.EXTERNAL_IDENTITY_UNLINKED);return true;
        });
    }
    private void changed(UUID actor,UUID keep) {
        jdbc.update("UPDATE account_identity SET security_epoch=security_epoch+1,credential_generation=credential_generation+1,revision=revision+1,updated_at=? WHERE id=?",time(now()),actor);
        if(keep!=null) { jdbc.update("UPDATE application_session SET security_epoch=security_epoch+1,credential_generation=credential_generation+1 WHERE id=?",keep); }
        jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL AND (?::uuid IS NULL OR id<>?)",time(now()),actor,keep,keep);
        jdbc.update("UPDATE password_reset_proof SET state='INVALIDATED' WHERE account_id=? AND state='ACTIVE'",actor);
        var rows=jdbc.query("""
                UPDATE ownership_transfer SET state=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'INVALIDATED' END,revision=revision+1,updated_at=?
                WHERE state='PENDING' AND (issuer_id=? OR recipient_id=?) RETURNING id,state
                """,(r,n)->Map.entry(r.getObject(1,UUID.class),r.getString(2)),time(now()),time(now()),actor,actor);
        for(var row:rows) { transfers.changed(actor,row.getKey(),row.getValue().equals("EXPIRED")?TransferAudit.Action.TRANSFER_EXPIRED:TransferAudit.Action.TRANSFER_INVALIDATED); }
    }
    private Account account(UUID id) {
        var member=memberships.lockForOrganizationWrite(id);
        return jdbc.queryForObject("SELECT * FROM account_identity WHERE id=? FOR UPDATE",(r,n)-> {
            if(!r.getString("state").equals("ACTIVE") || !r.getBoolean("email_verified") || r.getBoolean("credential_operation_pending")
                    || (!r.getString("kind").equals("PLATFORM_ADMIN") && !member.map(m->m.organizationActive()).orElse(false))) { throw new InvalidSession(); }
            return new Account(id,r.getLong("security_epoch"),r.getLong("credential_generation"));
        },id);
    }
    private Optional<Identity> identity(Subject s) {
        return jdbc.query("SELECT id,account_id,provider,active FROM external_identity WHERE issuer=? AND subject=?",(r,n)->new Identity(r.getObject(1,UUID.class),r.getObject(2,UUID.class),Provider.valueOf(r.getString(3)),r.getBoolean(4)),s.issuer(),s.subject()).stream().findFirst();
    }
    private void fresh(AuthenticatedSession s) { if(s.authenticatedAt().isAfter(now()) || !now().isBefore(s.authenticatedAt().plusSeconds(300))) { throw fail(ExternalFailure.Reason.REAUTHENTICATION_REQUIRED); } }
    private static byte[] hash(String value) { try { return SessionSecrets.hash(value); } catch(InvalidSession e) { throw invalid(); } }
    private static ExternalFailure invalid() { return fail(ExternalFailure.Reason.TOKEN_INVALID); }
    private static ExternalFailure fail(ExternalFailure.Reason reason) { return new ExternalFailure(reason); }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private static Timestamp time(Instant value) { return Timestamp.from(value); }
    private static Flow map(java.sql.ResultSet r,int n) throws java.sql.SQLException {
        return new Flow(r.getObject("id",UUID.class),Provider.valueOf(r.getString("provider")),Purpose.valueOf(r.getString("purpose")),SessionTransport.valueOf(r.getString("transport")),r.getString("return_target"),r.getString("native_challenge"),r.getBytes("browser_binding_hash"),r.getBytes("encrypted_verifier"),r.getObject("account_id",UUID.class),r.getObject("original_session_id",UUID.class),r.getBytes("original_token_hash"),(Long)r.getObject("security_epoch"),(Long)r.getObject("credential_generation"),r.getString("state"),r.getTimestamp("created_at").toInstant(),r.getTimestamp("expires_at").toInstant());
    }
    private record Flow(UUID id,Provider provider,Purpose purpose,SessionTransport transport,String target,String nativeChallenge,byte[] browserHash,byte[] encrypted,UUID account,UUID session,byte[] tokenHash,Long epoch,Long generation,String state,Instant created,Instant expires) { @Override public String toString() { return "ExternalFlow[redacted]"; } }
    private record Account(UUID id,long epoch,long generation) { }
    private record Identity(UUID id,UUID account,Provider provider,boolean active) { }
    public record StartResult(String authorizationUrl,Instant expiresAt,String browserBinding) { @Override public String toString() { return "ExternalStart[redacted]"; } }
    public record CallbackResult(String location,SessionCredentials credentials,SessionTransport transport) { @Override public String toString() { return "ExternalCallback[redacted]"; } }
    public record View(UUID id,String provider,Instant createdAt) { }
    public record Page(List<View> items,int page,int size,Integer total) { }
}
