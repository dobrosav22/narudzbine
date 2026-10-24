package com.narudzbine.identity.application;

import com.narudzbine.audit.api.EmailAudit;
import com.narudzbine.audit.api.TransferAudit;
import com.narudzbine.identity.api.*;
import com.narudzbine.notifications.api.SecurityNotices;
import com.narudzbine.organizations.api.MembershipAccess;
import com.narudzbine.shared.api.ResourceRevisions;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Own-account mailbox proofs and a fenced, non-retried remote email mutation. */
public final class EmailChangeService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final EmailCredentialMutator provider;
    private final LoginThrottle throttle;
    private final ResourceRevisions revisions;
    private final AccountRevisions accounts;
    private final EmailAudit audit;
    private final com.narudzbine.audit.api.RecoveryAudit recoveryAudit;
    private final TransferAudit transfers;
    private final SecurityNotices notices;
    private final EmailDeliveryCipher cipher;
    private final UuidGenerator ids;
    private final Clock clock;
    public EmailChangeService(JdbcTemplate jdbc,PlatformTransactionManager manager,SessionService sessions,MembershipAccess memberships,
            EmailCredentialMutator provider,LoginThrottle throttle,ResourceRevisions revisions,AccountRevisions accounts,EmailAudit audit,
            TransferAudit transfers,SecurityNotices notices,EmailDeliveryCipher cipher,UuidGenerator ids,Clock clock,com.narudzbine.audit.api.RecoveryAudit recoveryAudit) {
        this.jdbc=jdbc;tx=new TransactionTemplate(manager);tx.setTimeout(10);this.sessions=sessions;this.memberships=memberships;
        this.provider=provider;this.throttle=throttle;this.revisions=revisions;this.accounts=accounts;this.audit=audit;
        this.transfers=transfers;this.notices=notices;this.cipher=cipher;this.ids=ids;this.clock=clock;this.recoveryAudit=recoveryAudit;
    }
    public Creation request(String token,SessionTransport transport,String csrf,String newEmailInput,String expected) {
        LoginThrottle.requireNoTransaction();String next=LoginInput.email(newEmailInput);admit(token,transport,true);
        return tx.execute(status -> {
            var principal=sessions.authenticateForProfileWrite(token,transport);csrf(token,transport,csrf);fresh(principal);
            Account a=lockAccount(principal.accountId());
            var prior=jdbc.queryForList("SELECT id FROM email_change WHERE account_id=? AND request_revision_token=?",UUID.class,a.id(),expected);
            if(!prior.isEmpty()) {
                Stored s=read(a.id(),prior.getFirst());if(!s.next().equals(next)) { throw fail(EmailChangeFailure.Reason.IDEMPOTENCY_MISMATCH); }
                return new Creation(view(s,a),true);
            }
            if(!accounts.matches(a.id(),a.revision(),expected)) { throw new RevisionConflict(accounts.encode(a.id(),a.revision())); }
            if(a.email().equals(next)) { throw fail(EmailChangeFailure.Reason.INVALID_STATE); }
            if(a.subject()==null) { throw fail(EmailChangeFailure.Reason.DEPENDENCY_UNAVAILABLE); }
            var pending=jdbc.queryForList("SELECT new_email FROM email_change WHERE account_id=? AND state IN ('PENDING','RECONCILING')",String.class,a.id());
            var guards=new ArrayList<>(pending);guards.add(a.email());guards.add(next);lockEmails(guards);
            fresh(principal);
            for(UUID id:jdbc.queryForList("SELECT id FROM email_change WHERE account_id=? AND state IN ('PENDING','RECONCILING') FOR UPDATE",UUID.class,a.id())) {
                Stored old=read(a.id(),id);
                if(old.state().equals("RECONCILING")) { throw fail(EmailChangeFailure.Reason.REQUEST_IN_PROGRESS); }
                terminate(old,effective(old,a).equals("EXPIRED")?"EXPIRED":"CANCELLED");release(old);
            }
            vacateStaleClaim(next);
            if(jdbc.queryForObject("SELECT (SELECT count(*) FROM login_email_claim WHERE email=?)+(SELECT count(*) FROM setup_email_claim WHERE email=?)",Integer.class,next,next)!=0) { throw fail(EmailChangeFailure.Reason.EMAIL_UNAVAILABLE); }
            UUID id=ids.next();Instant now=now();
            jdbc.update("""
                    INSERT INTO email_change(id,account_id,request_revision_token,old_email,new_email,security_epoch,credential_generation,state,created_at,expires_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,'PENDING',?,?,?)
                    """,id,a.id(),expected,a.email(),next,a.epoch(),a.generation(),time(now),time(now.plusSeconds(86400)),time(now));
            jdbc.update("INSERT INTO login_email_claim(email,account_id,kind,change_id,expires_at) VALUES (?,?,'RESERVED',?,?)",next,a.id(),id,time(now.plusSeconds(86400)));
            for(String side:List.of("OLD","NEW")) {
                UUID proof=ids.next();String secret=SessionSecrets.generate();
                jdbc.update("INSERT INTO email_change_proof(id,change_id,side,token_hash) VALUES (?,?,?,?)",proof,id,side,SessionSecrets.hash(secret));
                jdbc.update("""
                        INSERT INTO email_change_delivery(proof_id,encrypted_token,locale,state,created_at)
                        SELECT ?,?,COALESCE(a.language_override,o.default_language,'en'),'QUEUED',?
                        FROM account_identity a LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id WHERE a.id=?
                        """,proof,cipher.encrypt(proof,secret),time(now),a.id());
            }
            jdbc.update("UPDATE account_identity SET revision=revision+1,updated_at=? WHERE id=?",time(now),a.id());
            audit.emailChange(a.id(),id,EmailAudit.Action.EMAIL_CHANGE_REQUESTED);notices.emailChangeStarted(a.id(),id,a.email(),now);
            sessions.recordSuccessfulActivity(token,transport);return new Creation(view(read(a.id(),id),a),false);
        });
    }
    public View get(String token,SessionTransport transport,UUID id) {
        LoginThrottle.requireNoTransaction();
        UUID actor=tx.execute(status -> sessions.authenticateForEmailChange(token,transport,id,null,false).accountId());
        throttle.admitApi(actor,false);
        return tx.execute(status -> {
            sessions.authenticateForEmailChange(token,transport,id,null,false);Account a=lockAccount(actor);
            View v=view(read(actor,id),a);if(!a.pending()) { sessions.recordSuccessfulActivity(token,transport); }return v;
        });
    }
    public void cancel(String token,SessionTransport transport,String csrf,UUID id,String expected) {
        LoginThrottle.requireNoTransaction();admit(token,transport,true);
        tx.executeWithoutResult(status -> {
            var actor=sessions.authenticateForProfileWrite(token,transport);csrf(token,transport,csrf);Account a=lockAccount(actor.accountId());
            Stored s=read(a.id(),id);lockEmails(List.of(s.old(),s.next()));s=read(a.id(),id);
            if(s.state().equals("CANCELLED")) { return; }
            requireRevision(s,a,expected);
            if(!effective(s,a).equals("PENDING")) { throw fail(EmailChangeFailure.Reason.INVALID_STATE); }
            terminate(s,"CANCELLED");release(s);audit.emailChange(a.id(),id,EmailAudit.Action.EMAIL_CHANGE_CANCELLED);
            sessions.recordSuccessfulActivity(token,transport);
        });
    }
    public void verify(String token,String source) {
        LoginThrottle.requireNoTransaction();throttle.begin("email-change-proof",source);
        byte[] hash;try { hash=SessionSecrets.hash(token); } catch(InvalidSession e) { throw fail(EmailChangeFailure.Reason.TOKEN_INVALID); }
        var found=jdbc.query("""
                SELECT p.id,p.change_id,e.account_id,p.side FROM email_change_proof p JOIN email_change e ON e.id=p.change_id WHERE p.token_hash=?
                """,(r,n)->new Proof(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getObject(3,UUID.class),r.getString(4)),hash);
        if(found.isEmpty()) { throw fail(EmailChangeFailure.Reason.TOKEN_INVALID); }var p=found.getFirst();
        tx.executeWithoutResult(status -> {
            Account a=lockAccount(p.account());Stored s=read(a.id(),p.change());
            if(!a.active() || a.pending() || !effective(s,a).equals("PENDING")
                    || jdbc.queryForObject("SELECT count(*) FROM login_email_claim WHERE email=? AND account_id=? AND change_id=? AND kind='RESERVED'",Integer.class,s.next(),a.id(),s.id())!=1) {
                throw fail(EmailChangeFailure.Reason.TOKEN_INVALID);
            }
            if(jdbc.update("UPDATE email_change_proof SET verified_at=? WHERE id=? AND verified_at IS NULL",time(now()),p.id())!=1) { throw fail(EmailChangeFailure.Reason.TOKEN_INVALID); }
            jdbc.update("UPDATE email_change SET "+(p.side().equals("OLD")?"old_verified":"new_verified")+"=true,revision=revision+1,updated_at=? WHERE id=?",time(now()),s.id());
            audit.emailChange(a.id(),s.id(),EmailAudit.Action.EMAIL_ADDRESS_VERIFIED);
        });
    }
    public Completion complete(String token,SessionTransport transport,String csrf,UUID id,String expected) {
        return completeInternal(token,transport,csrf,id,expected,()->{},null);
    }
    Completion completeRecovery(String token,SessionTransport transport,String csrf,UUID id,String expected,Runnable guards,Runnable claim) {
        return completeInternal(token,transport,csrf,id,expected,guards,claim);
    }
    private Completion completeInternal(String token,SessionTransport transport,String csrf,UUID id,String expected,Runnable guards,Runnable claim) {
        LoginThrottle.requireNoTransaction();
        UUID actor=tx.execute(status -> sessions.authenticateForEmailChange(token,transport,id,csrf,true).accountId());throttle.admitApi(actor,true);
        Prepared prepared=tx.execute(status -> {
            guards.run();
            var principal=sessions.authenticateForEmailChange(token,transport,id,csrf,true);Account a=lockAccount(actor);
            Stored s=read(a.id(),id);lockEmails(List.of(s.old(),s.next()));s=read(a.id(),id);
            if(claim==null && jdbc.queryForObject("SELECT count(*) FROM recovery_case WHERE email_change_id=? AND state<>'COMPLETED'",Integer.class,id)>0) { throw new RecoveryFailure(RecoveryFailure.Reason.FORBIDDEN); }
            if(s.state().equals("COMPLETED")) { fresh(principal);return new Prepared(s,null,false,true); }
            if(s.state().equals("RECONCILING")) {
                if(!revision(s.revision(),s.id()).equals(expected) && !revision(s.revision()-1,s.id()).equals(expected)) { throw new RevisionConflict(view(s,a).revision()); }
                return new Prepared(s,operation(s,a),false,false);
            }
            fresh(principal);requireRevision(s,a,expected);
            if(!effective(s,a).equals("PENDING") || (claim==null && (!s.oldVerified() || !s.newVerified()))) { throw fail(EmailChangeFailure.Reason.INVALID_STATE); }
            if(a.pending() || a.subject()==null) { throw fail(EmailChangeFailure.Reason.REQUEST_IN_PROGRESS); }
            if(jdbc.queryForObject("SELECT count(*) FROM login_email_claim WHERE email=? AND account_id=? AND change_id=? AND kind='RESERVED'",Integer.class,s.next(),actor,id)!=1) { throw fail(EmailChangeFailure.Reason.EMAIL_UNAVAILABLE); }
            if(claim!=null) {claim.run();}
            fresh(principal);
            Instant now=now();UUID op=ids.next();
            jdbc.update("""
                    INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,current_session_id,created_at,updated_at)
                    VALUES (?,?,'EMAIL','PREPARED',?,?,?,?,?)
                    """,op,actor,a.epoch()+1,a.generation(),principal.sessionId(),time(now),time(now));
            jdbc.update("UPDATE email_change SET state='RECONCILING',operation_id=?,revision=revision+1,updated_at=? WHERE id=?",op,time(now),id);
            jdbc.update("UPDATE login_email_claim SET kind='IN_FLIGHT',expires_at=NULL WHERE email=? AND change_id=?",s.next(),id);
            jdbc.update("UPDATE account_identity SET credential_operation_pending=true,security_epoch=security_epoch+1,revision=revision+1,updated_at=? WHERE id=?",time(now),actor);
            jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id=? AND id<>? AND revoked_at IS NULL",time(now),actor,principal.sessionId());
            jdbc.update("UPDATE password_reset_proof SET state='INVALIDATED' WHERE account_id=? AND state='ACTIVE'",actor);
            var retired=jdbc.query("""
                    UPDATE ownership_transfer SET state=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'INVALIDATED' END,
                    revision=revision+1,updated_at=? WHERE state='PENDING' AND (issuer_id=? OR recipient_id=?) RETURNING id,state
                    """,(r,n)->Map.entry(r.getObject(1,UUID.class),r.getString(2)),time(now),time(now),actor,actor);
            for(var t:retired) { transfers.changed(actor,t.getKey(),t.getValue().equals("EXPIRED")?TransferAudit.Action.TRANSFER_EXPIRED:TransferAudit.Action.TRANSFER_INVALIDATED); }
            audit.emailOperation(actor,op,EmailAudit.OperationAction.EMAIL_OPERATION_STARTED);
            return new Prepared(read(actor,id),new Operation(op,a.epoch()+1,a.generation(),a.subject(),"PREPARED"),true,false);
        });
        if(prepared.replay()) {
            Stored s=prepared.change();return new Completion(new View(s.id(),revision(s.revision(),s.id()),s.state(),s.expires(),s.oldVerified(),s.newVerified()),true);
        }
        if(prepared.dispatch()) {
            EmailCredentialMutator.Outcome outcome;
            try { outcome=provider.change(prepared.operation().subject(),prepared.operation().id(),prepared.change().old(),prepared.change().next()); }
            catch(RuntimeException ex) { outcome=EmailCredentialMutator.Outcome.UNKNOWN; }
            if(outcome==null) { outcome=EmailCredentialMutator.Outcome.UNKNOWN; }
            recordOutcome(prepared.change(),outcome);
            if(outcome!=EmailCredentialMutator.Outcome.APPLIED) { throw fail(EmailChangeFailure.Reason.DEPENDENCY_UNAVAILABLE); }
        } else if(!confirm(prepared.change(),prepared.operation())) { throw fail(EmailChangeFailure.Reason.REQUEST_IN_PROGRESS); }
        return new Completion(tx.execute(status -> finish(prepared.change())),false);
    }

    /** Confirm first; PasswordLoginService then resolves the current email and verifies the submitted credential. */
    public void reconcileBeforeLogin(String email) {
        LoginThrottle.requireNoTransaction();
        var found=jdbc.query("""
                SELECT e.id,e.account_id FROM email_change e JOIN account_identity a ON a.id=e.account_id
                WHERE e.state='RECONCILING' AND a.credential_operation_pending AND (e.old_email=? OR e.new_email=?)
                """,(r,n)->Map.entry(r.getObject(1,UUID.class),r.getObject(2,UUID.class)),email,email);
        if(found.isEmpty()) { return; }var ref=found.getFirst();
        Prepared p=tx.execute(status -> { Account a=lockAccount(ref.getValue());Stored s=read(a.id(),ref.getKey());return a.active() && s.state().equals("RECONCILING")?new Prepared(s,operation(s,a),false,false):null; });
        if(p!=null && confirm(p.change(),p.operation())) { tx.executeWithoutResult(status -> finish(p.change())); }
    }
    private boolean confirm(Stored s,Operation op) {
        if(op.state().equals("APPLIED")) { return true; }
        if(op.state().equals("COMPLETED")) { return true; }
        EmailCredentialMutator.Outcome observed;
        try { observed=provider.reconcile(op.subject(),op.id(),s.old(),s.next()); }
        catch(RuntimeException ex) { observed=EmailCredentialMutator.Outcome.UNKNOWN; }
        if(observed!=EmailCredentialMutator.Outcome.APPLIED) { return false; }
        recordOutcome(s,EmailCredentialMutator.Outcome.APPLIED);return true;
    }
    private void recordOutcome(Stored input,EmailCredentialMutator.Outcome result) {
        tx.executeWithoutResult(status -> {
            Account a=lockAccount(input.account());lockEmails(List.of(input.old(),input.next()));Stored s=read(a.id(),input.id());Operation op=operation(s,a);
            if(op.state().equals("APPLIED") || op.state().equals("COMPLETED")) { return; }
            barrier(a,op);
            String state=result==EmailCredentialMutator.Outcome.APPLIED?"APPLIED":result==EmailCredentialMutator.Outcome.REJECTED?"REJECTED":"UNKNOWN";
            jdbc.update("UPDATE credential_operation SET state=?,updated_at=? WHERE id=?",state,time(now()),op.id());
            if(state.equals("REJECTED")) {
                for(UUID recovery:jdbc.queryForList("UPDATE recovery_case SET state='REJECTED',revision=revision+1,updated_at=? WHERE email_change_id=? AND state='RECONCILING' RETURNING id",UUID.class,time(now()),s.id())) {
                    recoveryAudit.recovery(a.id(),recovery,com.narudzbine.audit.api.RecoveryAudit.Action.RECOVERY_REJECTED,"Provider definitively rejected authorized email recovery");
                }
                terminate(s,"CANCELLED");release(s);
                jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL",time(now()),a.id());
                jdbc.update("UPDATE account_identity SET credential_operation_pending=false,revision=revision+1,updated_at=? WHERE id=?",time(now()),a.id());
            }
            audit.emailOperation(a.id(),op.id(),state.equals("APPLIED")?EmailAudit.OperationAction.EMAIL_OPERATION_APPLIED:state.equals("REJECTED")?EmailAudit.OperationAction.EMAIL_OPERATION_REJECTED:EmailAudit.OperationAction.EMAIL_OPERATION_UNCERTAIN);
        });
    }
    private View finish(Stored input) {
        Account a=lockAccount(input.account());lockEmails(List.of(input.old(),input.next()));Stored s=read(a.id(),input.id());
        if(s.state().equals("COMPLETED")) { return view(s,a); }Operation op=operation(s,a);barrier(a,op);
        if(!a.active() || !op.state().equals("APPLIED") || !a.email().equals(s.old())) { throw fail(EmailChangeFailure.Reason.REQUEST_IN_PROGRESS); }
        jdbc.update("""
                UPDATE account_identity SET email=?,credential_generation=credential_generation+1,credential_operation_pending=false,
                    revision=revision+1,updated_at=? WHERE id=?
                """,s.next(),time(now()),a.id());
        jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL",time(now()),a.id());
        notices.emailChanged(a.id(),s.id(),op.id(),s.old(),s.next(),now());
        jdbc.update("UPDATE email_change SET state='COMPLETED',revision=revision+1,updated_at=? WHERE id=?",time(now()),s.id());
        jdbc.update("UPDATE credential_operation SET state='COMPLETED',updated_at=? WHERE id=?",time(now()),op.id());
        for(var recovery:jdbc.queryForList("UPDATE recovery_case SET state='COMPLETED',revision=revision+1,updated_at=? WHERE email_change_id=? AND state='RECONCILING' RETURNING id,organization_id",time(now()),s.id())) {
            UUID caseId=(UUID)recovery.get("id"),org=(UUID)recovery.get("organization_id");
            notices.recovered(org,caseId,a.id(),s.old(),s.next(),false,now());
            recoveryAudit.recovery(a.id(),caseId,com.narudzbine.audit.api.RecoveryAudit.Action.RECOVERY_COMPLETED,"Authorized email recovery completed");
        }
        audit.emailOperation(a.id(),op.id(),EmailAudit.OperationAction.EMAIL_OPERATION_COMPLETED);return view(read(a.id(),s.id()),a);
    }
    /** Caller holds the reviewed recovery context guards. Not exposed as an ordinary mailbox-proof API. */
    UUID stageRecovery(UUID caseId,UUID actor,String next) {
        if(!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) {throw new IllegalStateException("Recovery staging requires transaction.");}
        Account a=lockAccount(actor);lockEmails(List.of(a.email(),next));
        if(a.pending() || a.subject()==null) {throw fail(EmailChangeFailure.Reason.REQUEST_IN_PROGRESS);}
        vacateStaleClaim(next);
        if(jdbc.queryForObject("SELECT (SELECT count(*) FROM login_email_claim WHERE email=?)+(SELECT count(*) FROM setup_email_claim WHERE email=?)",Integer.class,next,next)!=0) {throw fail(EmailChangeFailure.Reason.EMAIL_UNAVAILABLE);}
        if(jdbc.queryForObject("SELECT count(*) FROM email_change WHERE account_id=? AND state IN ('PENDING','RECONCILING')",Integer.class,actor)!=0) {throw fail(EmailChangeFailure.Reason.REQUEST_IN_PROGRESS);}
        UUID id=ids.next();Instant now=now();
        jdbc.update("""
                INSERT INTO email_change(id,account_id,request_revision_token,old_email,new_email,security_epoch,credential_generation,state,old_verified,new_verified,created_at,expires_at,updated_at)
                VALUES (?,?,?,?,?,?,?,'PENDING',false,true,?,?,?)
                """,id,actor,"recovery/"+caseId,a.email(),next,a.epoch(),a.generation(),time(now),time(now.plusSeconds(86400)),time(now));
        jdbc.update("INSERT INTO login_email_claim(email,account_id,kind,change_id,expires_at) VALUES (?,?,'RESERVED',?,?)",next,actor,id,time(now.plusSeconds(86400)));
        audit.emailChange(actor,id,EmailAudit.Action.EMAIL_CHANGE_REQUESTED);return id;
    }
    private void vacateStaleClaim(String email) {
        var stale=jdbc.queryForList("""
                SELECT e.id FROM login_email_claim c JOIN email_change e ON e.id=c.change_id JOIN account_identity a ON a.id=e.account_id
                WHERE c.email=? AND c.kind='RESERVED' AND e.state='PENDING'
                AND (e.expires_at<=? OR e.security_epoch<>a.security_epoch OR e.credential_generation<>a.credential_generation)
                """,UUID.class,email,time(now()));
        for(UUID id:stale) {
            jdbc.update("UPDATE email_change SET state=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'CANCELLED' END,revision=revision+1,updated_at=? WHERE id=? AND state='PENDING'",time(now()),time(now()),id);
            jdbc.update("DELETE FROM login_email_claim WHERE email=? AND change_id=? AND kind='RESERVED'",email,id);
        }
    }
    private void lockEmails(Collection<String> emails) { for(String email:new TreeSet<>(emails)) { jdbc.query("SELECT lock_login_email(?)",r -> {},email); } }
    private void terminate(Stored s,String state) { jdbc.update("UPDATE email_change SET state=?,revision=revision+1,updated_at=? WHERE id=?",state,time(now()),s.id()); }
    private void release(Stored s) { jdbc.update("DELETE FROM login_email_claim WHERE email=? AND change_id=? AND kind<>'CURRENT'",s.next(),s.id()); }
    private void requireRevision(Stored s,Account a,String expected) { if(!view(s,a).revision().equals(expected)) { throw new RevisionConflict(view(s,a).revision()); } }
    private void barrier(Account a,Operation op) { if(!a.pending() || a.epoch()!=op.epoch() || a.generation()!=op.generation()) { throw fail(EmailChangeFailure.Reason.REQUEST_IN_PROGRESS); } }
    private void fresh(AuthenticatedSession s) { if(s.authenticatedAt().isAfter(now()) || !now().isBefore(s.authenticatedAt().plusSeconds(300))) { throw fail(EmailChangeFailure.Reason.REAUTHENTICATION_REQUIRED); } }
    private void csrf(String token,SessionTransport t,String value) { if(t==SessionTransport.BROWSER) { sessions.requireCsrf(token,value); } }
    private void admit(String token,SessionTransport t,boolean write) { UUID id=tx.execute(status->sessions.authenticate(token,t).accountId());throttle.admitApi(id,write); }
    private String effective(Stored s,Account a) {
        if(!s.state().equals("PENDING")) { return s.state(); }
        if(!now().isBefore(s.expires())) { return "EXPIRED"; }
        if(!a.active() || a.epoch()!=s.epoch() || a.generation()!=s.generation() || !a.email().equals(s.old())) { return "CANCELLED"; }
        return "PENDING";
    }
    private View view(Stored s,Account a) { String state=effective(s,a);return new View(s.id(),revision(s.revision()+(state.equals(s.state())?0:1),s.id()),state,s.expires(),s.oldVerified(),s.newVerified()); }
    private String revision(long version,UUID id) { return revisions.encode("emailchange/v1",id,version); }
    private Account lockAccount(UUID id) { var member=memberships.lockForOrganizationWrite(id);return account(id,member.map(m->m.organizationActive()).orElse(false),true); }
    private Account account(UUID id,boolean memberActive,boolean lock) {
        return jdbc.queryForObject("""
                SELECT a.*,p.tenant_id,p.provider_user_id FROM account_identity a LEFT JOIN managed_password_identity p ON p.account_id=a.id WHERE a.id=?
                """+(lock?" FOR UPDATE OF a":""),(r,n)->new Account(id,r.getString("email"),r.getLong("revision"),r.getLong("security_epoch"),r.getLong("credential_generation"),r.getBoolean("credential_operation_pending"),
                        "ACTIVE".equals(r.getString("state")) && r.getBoolean("email_verified") && (memberActive || r.getString("kind").equals("PLATFORM_ADMIN")),
                        r.getObject("tenant_id")==null?null:new PasswordCredentialVerifier.Subject(r.getObject("tenant_id",UUID.class),r.getObject("provider_user_id",UUID.class))),id);
    }
    private Stored read(UUID account,UUID id) {
        var rows=jdbc.query("SELECT * FROM email_change WHERE account_id=? AND id=?",(r,n)->new Stored(id,account,r.getString("old_email"),r.getString("new_email"),r.getLong("security_epoch"),r.getLong("credential_generation"),r.getString("state"),r.getLong("revision"),r.getBoolean("old_verified"),r.getBoolean("new_verified"),r.getObject("operation_id",UUID.class),r.getTimestamp("expires_at").toInstant()),account,id);
        if(rows.isEmpty()) { throw fail(EmailChangeFailure.Reason.NOT_FOUND); }return rows.getFirst();
    }
    private Operation operation(Stored s,Account a) { return jdbc.queryForObject("SELECT * FROM credential_operation WHERE id=? AND account_id=? FOR UPDATE",(r,n)->new Operation(s.operation(),r.getLong("security_epoch"),r.getLong("credential_generation"),a.subject(),r.getString("state")),s.operation(),a.id()); }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private static Timestamp time(Instant value) { return Timestamp.from(value); }
    private static EmailChangeFailure fail(EmailChangeFailure.Reason r) { return new EmailChangeFailure(r); }
    private record Account(UUID id,String email,long revision,long epoch,long generation,boolean pending,boolean active,PasswordCredentialVerifier.Subject subject) { @Override public String toString() { return "EmailAccount[redacted]"; } }
    private record Stored(UUID id,UUID account,String old,String next,long epoch,long generation,String state,long revision,boolean oldVerified,boolean newVerified,UUID operation,Instant expires) { @Override public String toString() { return "EmailChange[redacted]"; } }
    private record Operation(UUID id,long epoch,long generation,PasswordCredentialVerifier.Subject subject,String state) { }
    private record Prepared(Stored change,Operation operation,boolean dispatch,boolean replay) { }
    private record Proof(UUID id,UUID change,UUID account,String side) { }
    public record View(UUID id,String revision,String state,Instant expiresAt,boolean oldAddressVerified,boolean newAddressVerified) { }
    public record Creation(View change,boolean replay) { }
    public record Completion(View change,boolean replay) { }
}
