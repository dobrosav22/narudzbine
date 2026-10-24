package com.narudzbine.identity.application;

import com.narudzbine.identity.api.*;
import com.narudzbine.audit.api.RecoveryAudit;
import com.narudzbine.audit.api.TransferAudit;
import com.narudzbine.notifications.api.SecurityNotices;
import com.narudzbine.shared.api.ResourceRevisions;
import com.narudzbine.shared.api.UuidGenerator;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Evidence inspection occurs outside transactions. Organization guard precedes sorted identities and case/session locks. */
public final class RecoveryService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final SessionService sessions;
    private final LoginThrottle throttle;
    private final RecoveryEvidence evidence;
    private final RecoveryAudit audit;
    private final TransferAudit transfers;
    private final SecurityNotices notices;
    private final EmailChangeService emails;
    private final RecoveryDeliveryCipher cipher;
    private final ResourceRevisions revisions;
    private final UuidGenerator ids;
    private final Clock clock;
    public RecoveryService(JdbcTemplate jdbc,PlatformTransactionManager manager,SessionService sessions,LoginThrottle throttle,
            RecoveryEvidence evidence,RecoveryAudit audit,TransferAudit transfers,SecurityNotices notices,EmailChangeService emails,
            RecoveryDeliveryCipher cipher,ResourceRevisions revisions,UuidGenerator ids,Clock clock) {
        this.jdbc=jdbc;tx=new TransactionTemplate(manager);tx.setTimeout(10);this.sessions=sessions;this.throttle=throttle;this.evidence=evidence;
        this.audit=audit;this.transfers=transfers;this.notices=notices;this.emails=emails;this.cipher=cipher;this.revisions=revisions;this.ids=ids;this.clock=clock;
    }
    public Creation create(String token,SessionTransport transport,String csrf,Request input) {
        LoginThrottle.requireNoTransaction();UUID actor=admitAdmin(token,transport,true);
        return tx.execute(status->{
            // This preliminary identity is immutable; the intent advisory guard serializes duplicate resource creation.
            jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,17001))",r->{},input.id().toString());
            guard(input.organizationId(),Set.of(actor,input.targetAccountId()));
            var principal=admin(token,transport,csrf);fresh(principal);
            byte[] digest=digest(input);
            var prior=jdbc.queryForList("SELECT * FROM recovery_case WHERE id=?",input.id());
            if(!prior.isEmpty()) {
                Stored s=new Stored(prior.getFirst());if(!s.uuid("creator_id").equals(actor)) {throw fail(RecoveryFailure.Reason.NOT_FOUND);}
                if(!MessageDigest.isEqual(digest,s.bytes("request_digest"))) {throw fail(RecoveryFailure.Reason.IDEMPOTENCY_MISMATCH);}
                if(!now().isBefore(s.instant("created_at").plus(7,ChronoUnit.DAYS))) {throw new RecoveryFailure(RecoveryFailure.Reason.REPLAY_EXPIRED,input.id());}
                return new Creation(new View(s.uuid("id"),revisions.encode("recovery/v1",s.uuid("id"),1),s.text("kind"),s.uuid("organization_id"),s.uuid("target_id"),"EVIDENCE_REVIEW",s.instant("created_at").plusSeconds(86400),s.instant("created_at").plus(8,ChronoUnit.DAYS)),true);
            }
            var org=org(input.organizationId());UUID former=(UUID)org.get("owner_account_id");var target=account(input.targetAccountId());var owner=account(former);
            requireTarget(input.organizationId(),input.targetAccountId());
            if(!"ACTIVE".equals(org.get("state")) || !active(target) || Boolean.TRUE.equals(owner.get("credential_operation_pending"))) {throw fail(RecoveryFailure.Reason.INVALID_STATE);}
            if(input.kind().equals("OWNER") && former.equals(input.targetAccountId())) {throw fail(RecoveryFailure.Reason.INVALID_STATE);}
            if(input.kind().equals("EMAIL") && input.newEmail().equals(target.get("email"))) {throw fail(RecoveryFailure.Reason.INVALID_STATE);}
            Instant now=now();
            jdbc.update("""
                    INSERT INTO recovery_case(id,creator_id,creator_epoch,organization_id,target_id,former_owner_id,target_epoch,target_generation,owner_epoch,owner_generation,
                    kind,old_email,new_email,reason,evidence_reference,request_digest,state,created_at,not_before,expires_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'EVIDENCE_REVIEW',?,?,?,?)
                    """,input.id(),actor,number(account(actor),"security_epoch"),input.organizationId(),input.targetAccountId(),former,
                    number(target,"security_epoch"),number(target,"credential_generation"),number(owner,"security_epoch"),number(owner,"credential_generation"),
                    input.kind(),target.get("email"),input.newEmail(),input.reason(),input.evidenceReference(),digest,time(now),time(now.plusSeconds(86400)),time(now.plus(8,ChronoUnit.DAYS)),time(now));
            delivery(input.id(),input.targetAccountId(),"NOTICE",(String)target.get("email"),null);
            if(!former.equals(input.targetAccountId())) {delivery(input.id(),former,"NOTICE",(String)owner.get("email"),null);}
            audit.recovery(actor,input.id(),RecoveryAudit.Action.RECOVERY_CREATED,input.reason());sessions.recordSuccessfulActivity(token,transport);
            return new Creation(view(read(input.id(),true)),false);
        });
    }
    public View get(String token,SessionTransport transport,UUID id) {
        LoginThrottle.requireNoTransaction();UUID actor=admitAdmin(token,transport,false);
        return tx.execute(status->{var s=read(id,false);guard(s,actor);sessions.authenticate(token,transport);s=read(id,true);
            audit.recovery(actor,id,RecoveryAudit.Action.RECOVERY_READ,"Recovery case read");sessions.recordSuccessfulActivity(token,transport);return view(s);});
    }
    public View review(String token,SessionTransport transport,String csrf,UUID id,String expected,boolean approve,String reason,String reference) {
        LoginThrottle.requireNoTransaction();UUID actor=admitAdmin(token,transport,true);
        Stored snapshot=tx.execute(status->{Stored s=read(id,false);guard(s,actor);var p=admin(token,transport,csrf);fresh(p);s=read(id,true);
            if(actor.equals(s.uuid("creator_id"))) {throw fail(RecoveryFailure.Reason.FORBIDDEN);}return s;});
        RecoveryEvidence.NoticeProof proof=null;
        if(approve) {
            try {proof=evidence.inspect(new RecoveryEvidence.Context(id,snapshot.text("kind"),snapshot.uuid("organization_id"),snapshot.uuid("target_id"),snapshot.uuid("former_owner_id"),snapshot.text("old_email"),snapshot.text("new_email"),snapshot.uuid("creator_id"),actor,snapshot.instant("created_at")),snapshot.text("evidence_reference"),reference);}
            catch(RuntimeException ex) {throw fail(RecoveryFailure.Reason.DEPENDENCY_UNAVAILABLE);}
            if(proof==null || !proof.registrationVerified() || !proof.requesterVerified() || !proof.independentContactVerified() || !proof.challengeClear()
                    || proof.noticeCompletedAt()==null || !proof.noticeCompletedAt().equals(proof.noticeCompletedAt().truncatedTo(ChronoUnit.MILLIS)) || proof.noticeCompletedAt().isBefore(snapshot.instant("created_at")) || proof.noticeCompletedAt().isAfter(now())) {throw fail(RecoveryFailure.Reason.EVIDENCE_INCOMPLETE);}
        }
        final var verified=proof;
        return tx.execute(status->{guard(snapshot,actor);var p=admin(token,transport,csrf);fresh(p);Stored s=read(id,true);
            if(actor.equals(s.uuid("creator_id"))) {throw fail(RecoveryFailure.Reason.FORBIDDEN);}
            if(s.uuid("reviewer_id")!=null && actor.equals(s.uuid("reviewer_id")) && reason.equals(s.text("review_reason")) && reference.equals(s.text("review_reference"))
                    && approve==!s.text("state").equals("REJECTED")) {return view(s);}
            requireRevision(s,expected);if(!effective(s).equals("EVIDENCE_REVIEW")) {throw fail(RecoveryFailure.Reason.INVALID_STATE);}
            Instant notBefore=approve?verified.noticeCompletedAt().plusSeconds(86400):s.instant("not_before");String acceptance=approve?SessionSecrets.generate():null;
            jdbc.update("""
                    UPDATE recovery_case SET reviewer_id=?,reviewer_epoch=?,review_reason=?,review_reference=?,state=?,token_hash=?,not_before=?,expires_at=?,revision=revision+1,updated_at=? WHERE id=?
                    """,actor,number(account(actor),"security_epoch"),reason,reference,approve?"NOTICE_PERIOD":"REJECTED",acceptance==null?null:SessionSecrets.hash(acceptance),time(notBefore),time(notBefore.plus(7,ChronoUnit.DAYS)),time(now()),id);
            if(approve) {delivery(id,s.uuid("target_id"),"ACCEPTANCE",s.text("kind").equals("EMAIL")?s.text("new_email"):s.text("old_email"),acceptance);}
            audit.recovery(actor,id,approve?RecoveryAudit.Action.RECOVERY_APPROVED:RecoveryAudit.Action.RECOVERY_REJECTED,reason);sessions.recordSuccessfulActivity(token,transport);return view(read(id,true));
        });
    }
    public boolean accept(String token,SessionTransport transport,String csrf,UUID id,String acceptance) {
        LoginThrottle.requireNoTransaction();
        UUID actor=tx.execute(status->{byte[] hash=SessionSecrets.hash(token);var own=jdbc.queryForList("SELECT r.* FROM recovery_case r JOIN application_session s ON s.account_id=r.target_id WHERE r.id=? AND s.token_hash=?",id,hash);
            Stored ownCase=own.isEmpty()?null:new Stored(own.getFirst());return ownCase!=null&&ownCase.text("state").equals("RECONCILING")?sessions.authenticateForEmailChange(token,transport,ownCase.uuid("email_change_id"),csrf,true).accountId():sessions.authenticate(token,transport).accountId();});
        throttle.admitApi(actor,true);Stored initial=read(id,false);if(!actor.equals(initial.uuid("target_id"))){throw fail(RecoveryFailure.Reason.NOT_FOUND);}
        if(initial.text("state").equals("NOTICE_PERIOD")) {
            RecoveryEvidence.NoticeProof proof;
            try {proof=evidence.inspect(new RecoveryEvidence.Context(id,initial.text("kind"),initial.uuid("organization_id"),initial.uuid("target_id"),initial.uuid("former_owner_id"),initial.text("old_email"),initial.text("new_email"),initial.uuid("creator_id"),initial.uuid("reviewer_id"),initial.instant("created_at")),initial.text("evidence_reference"),initial.text("review_reference"));}
            catch(RuntimeException ex){throw fail(RecoveryFailure.Reason.DEPENDENCY_UNAVAILABLE);}
            if(proof==null||!proof.registrationVerified()||!proof.requesterVerified()||!proof.independentContactVerified()||!proof.challengeClear()||proof.noticeCompletedAt()==null||!proof.noticeCompletedAt().plusSeconds(86400).equals(initial.instant("not_before"))){throw fail(RecoveryFailure.Reason.EVIDENCE_INCOMPLETE);}
        }
        boolean completed=tx.execute(status->{guard(initial,actor);Stored s=read(id,true);var p=principal(token,transport,csrf,s);
            if(!actor.equals(s.uuid("target_id"))) {throw fail(RecoveryFailure.Reason.NOT_FOUND);}token(s,acceptance);
            if(s.text("state").equals("COMPLETED")) {fresh(p);return true;}
            if(s.text("state").equals("RECONCILING")) {return false;}
            requireAcceptance(s,p);
            if(s.text("kind").equals("EMAIL")) {
                if(s.uuid("email_change_id")==null) {UUID change=emails.stageRecovery(id,actor,s.text("new_email"));
                    jdbc.update("UPDATE recovery_case SET email_change_id=?,revision=revision+1,updated_at=? WHERE id=?",change,time(now()),id);}
                return false;
            }
            UUID former=s.uuid("former_owner_id"),org=s.uuid("organization_id");
            jdbc.update("UPDATE business_account SET role=CASE WHEN id=? THEN 'OWNER' ELSE 'ADMIN' END WHERE organization_id=? AND id IN (?,?)",actor,org,former,actor);
            jdbc.update("UPDATE organization SET owner_account_id=?,revision=revision+1,updated_at=? WHERE id=?",actor,time(now()),org);
            jdbc.update("UPDATE account_identity SET state=CASE WHEN id=? THEN 'DEACTIVATED' ELSE state END,security_epoch=security_epoch+1,credential_generation=credential_generation+1,revision=revision+1,updated_at=? WHERE id IN (?,?)",former,time(now()),former,actor);
            for(UUID account:Set.of(former,actor)) {retire(account,actor);notices.recovered(org,id,account,(String)account(account).get("email"),null,true,now());}
            jdbc.update("UPDATE recovery_case SET state='COMPLETED',consumed_at=?,revision=revision+1,updated_at=? WHERE id=?",time(now()),time(now()),id);
            audit.recovery(actor,id,RecoveryAudit.Action.RECOVERY_COMPLETED,"Reviewed owner recovery accepted by intended existing member");return false;
        });
        Stored s=read(id,false);
        if(completed || s.text("kind").equals("OWNER")) {return completed;}
        UUID change=s.uuid("email_change_id");long revision=jdbc.queryForObject("SELECT revision FROM email_change WHERE id=?",Long.class,change);
        emails.completeRecovery(token,transport,csrf,change,revisions.encode("emailchange/v1",change,revision),()->guard(s,actor),()->{
            Stored current=read(id,true);var p=principal(token,transport,csrf,current);token(current,acceptance);requireAcceptance(current,p);
            jdbc.update("UPDATE recovery_case SET state='RECONCILING',consumed_at=?,revision=revision+1,updated_at=? WHERE id=?",time(now()),time(now()),id);
            audit.recovery(actor,id,RecoveryAudit.Action.RECOVERY_ACCEPTED,"Reviewed email recovery accepted by intended existing account");
        });
        return false;
    }
    private void requireAcceptance(Stored s,AuthenticatedSession p) {
        fresh(p);String state=effective(s);if(state.equals("NOTICE_PERIOD")) {throw fail(RecoveryFailure.Reason.NOTICE_PERIOD);}
        if(!state.equals("AWAITING_ACCEPTANCE")) {throw fail(RecoveryFailure.Reason.INVALID_STATE);}
    }
    private void retire(UUID account,UUID actor) {
        jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL",time(now()),account);
        jdbc.update("UPDATE password_reset_proof SET state='INVALIDATED' WHERE account_id=? AND state='ACTIVE'",account);
        var retired=jdbc.queryForList("UPDATE ownership_transfer SET state=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'INVALIDATED' END,revision=revision+1,updated_at=? WHERE state='PENDING' AND (issuer_id=? OR recipient_id=?) RETURNING id,state",time(now()),time(now()),account,account);
        for(var t:retired) {transfers.changed(actor,(UUID)t.get("id"),"EXPIRED".equals(t.get("state"))?TransferAudit.Action.TRANSFER_EXPIRED:TransferAudit.Action.TRANSFER_INVALIDATED);}
    }
    private UUID admitAdmin(String token,SessionTransport transport,boolean write) {UUID actor=tx.execute(status->{var p=sessions.authenticate(token,transport);if(!p.platformAdministrator()){throw fail(RecoveryFailure.Reason.FORBIDDEN);}return p.accountId();});throttle.admitApi(actor,write);return actor;}

    private AuthenticatedSession principal(String token,SessionTransport transport,String csrf,Stored s) {
        if(s.text("state").equals("RECONCILING")) {return sessions.authenticateForEmailChange(token,transport,s.uuid("email_change_id"),csrf,true);}
        var p=sessions.authenticate(token,transport);if(transport==SessionTransport.BROWSER) {sessions.requireCsrf(token,csrf);}return p;
    }
    private AuthenticatedSession admin(String token,SessionTransport transport,String csrf) {var p=sessions.authenticate(token,transport);if(!p.platformAdministrator()) {throw fail(RecoveryFailure.Reason.FORBIDDEN);}if(transport==SessionTransport.BROWSER){sessions.requireCsrf(token,csrf);}return p;}
    private void guard(Stored s,UUID actor) {var accounts=new HashSet<UUID>(Arrays.asList(actor,s.uuid("creator_id"),s.uuid("target_id"),s.uuid("former_owner_id")));if(s.uuid("reviewer_id")!=null){accounts.add(s.uuid("reviewer_id"));}guard(s.uuid("organization_id"),accounts);}
    private void guard(UUID organization,Set<UUID> accounts) {
        var orgs=jdbc.queryForList("SELECT owner_account_id FROM organization WHERE id=? FOR UPDATE",UUID.class,organization);if(orgs.isEmpty()){throw fail(RecoveryFailure.Reason.NOT_FOUND);}
        var all=new HashSet<>(accounts);all.add(orgs.getFirst());
        var ordered=new ArrayList<>(all);ordered.sort((a,b)->a.toString().compareTo(b.toString()));
        for(UUID account:ordered){jdbc.queryForList("SELECT id FROM account_identity WHERE id=? FOR UPDATE",UUID.class,account);}
    }
    private String effective(Stored s) {
        String state=s.text("state");if(Set.of("COMPLETED","REJECTED","RECONCILING").contains(state)){return state;}
        if(!now().isBefore(s.instant("expires_at"))){return "EXPIRED";}
        var org=org(s.uuid("organization_id"));var target=account(s.uuid("target_id"));var owner=account(s.uuid("former_owner_id"));var creator=account(s.uuid("creator_id"));
        if(!"ACTIVE".equals(org.get("state")) || !s.uuid("former_owner_id").equals(org.get("owner_account_id")) || !active(target)
                || number(target,"security_epoch")!=s.number("target_epoch") || number(target,"credential_generation")!=s.number("target_generation")
                || number(owner,"security_epoch")!=s.number("owner_epoch") || number(owner,"credential_generation")!=s.number("owner_generation")
                || Boolean.TRUE.equals(owner.get("credential_operation_pending")) || !active(creator) || number(creator,"security_epoch")!=s.number("creator_epoch")
                || !s.text("old_email").equals(target.get("email"))){return "INVALIDATED";}
        if(s.uuid("reviewer_id")!=null){var reviewer=account(s.uuid("reviewer_id"));if(!active(reviewer)||number(reviewer,"security_epoch")!=s.number("reviewer_epoch")){return "INVALIDATED";}}
        if(state.equals("NOTICE_PERIOD") && !now().isBefore(s.instant("not_before"))){return "AWAITING_ACCEPTANCE";}return state;
    }
    private void delivery(UUID id,UUID recipient,String kind,String destination,String acceptance) {
        UUID delivery=ids.next();jdbc.update("""
                INSERT INTO recovery_delivery(id,case_id,kind,recipient_id,destination_email,encrypted_token,locale,state,created_at)
                SELECT ?,?,?,?,?,?,COALESCE(a.language_override,o.default_language,'en'),'QUEUED',? FROM account_identity a
                LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id WHERE a.id=?
                """,delivery,id,kind,recipient,destination,acceptance==null?null:cipher.encrypt(delivery,acceptance),time(now()),recipient);
    }
    private void requireTarget(UUID org,UUID target){if(jdbc.queryForObject("SELECT count(*) FROM business_account WHERE organization_id=? AND id=?",Integer.class,org,target)!=1){throw fail(RecoveryFailure.Reason.NOT_FOUND);}}
    private Stored read(UUID id,boolean lock){var rows=jdbc.queryForList("SELECT * FROM recovery_case WHERE id=?"+(lock?" FOR UPDATE":""),id);if(rows.isEmpty()){throw fail(RecoveryFailure.Reason.NOT_FOUND);}return new Stored(rows.getFirst());}
    private Map<String,Object> account(UUID id){return jdbc.queryForMap("SELECT * FROM account_identity WHERE id=?",id);}
    private Map<String,Object> org(UUID id){return jdbc.queryForMap("SELECT * FROM organization WHERE id=?",id);}
    private boolean active(Map<String,Object> a){return "ACTIVE".equals(a.get("state"))&&Boolean.TRUE.equals(a.get("email_verified"))&&!Boolean.TRUE.equals(a.get("credential_operation_pending"));}
    private void token(Stored s,String token){byte[] hash;try{hash=SessionSecrets.hash(token);}catch(InvalidSession ex){throw fail(RecoveryFailure.Reason.TOKEN_INVALID);}if(s.bytes("token_hash")==null||!MessageDigest.isEqual(hash,s.bytes("token_hash"))){throw fail(RecoveryFailure.Reason.TOKEN_INVALID);}}
    private void fresh(AuthenticatedSession p){if(p.authenticatedAt().isAfter(now())||!now().isBefore(p.authenticatedAt().plusSeconds(300))){throw fail(RecoveryFailure.Reason.REAUTHENTICATION_REQUIRED);}}
    private View view(Stored s){String state=effective(s);return new View(s.uuid("id"),revisions.encode("recovery/v1",s.uuid("id"),s.number("revision")),s.text("kind"),s.uuid("organization_id"),s.uuid("target_id"),state,s.instant("not_before"),s.instant("expires_at"));}
    private void requireRevision(Stored s,String expected){if(!view(s).revision().equals(expected)){throw new RevisionConflict(view(s).revision());}}
    private byte[] digest(Request r){return java.util.Objects.requireNonNull(digestText(tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(List.of(r.kind(),r.organizationId().toString(),r.targetAccountId().toString(),Objects.toString(r.newEmail(),""),r.reason(),r.evidenceReference()))));}
    private byte[] digestText(String value){try{return MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(java.security.GeneralSecurityException ex){throw new IllegalStateException("Required hashing unavailable.");}}
    private static long number(Map<String,Object> m,String name){return ((Number)m.get(name)).longValue();}
    private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
    private static Timestamp time(Instant i){return Timestamp.from(i);}
    private static RecoveryFailure fail(RecoveryFailure.Reason reason){return new RecoveryFailure(reason);}
    private record Stored(Map<String,Object> values){UUID uuid(String key){return (UUID)values.get(key);}String text(String key){return (String)values.get(key);}long number(String key){return ((Number)values.get(key)).longValue();}byte[] bytes(String key){return (byte[])values.get(key);}Instant instant(String key){return ((Timestamp)values.get(key)).toInstant();}@Override public String toString(){return "RecoveryCase[redacted]";}}
    public record Request(UUID id,String kind,UUID organizationId,UUID targetAccountId,String newEmail,String reason,String evidenceReference){@Override public String toString(){return "RecoveryRequest[redacted]";}}
    public record View(UUID id,String revision,String kind,UUID organizationId,UUID targetAccountId,String state,Instant notBefore,Instant expiresAt){}
    public record Creation(View recovery,boolean replay){}
}
