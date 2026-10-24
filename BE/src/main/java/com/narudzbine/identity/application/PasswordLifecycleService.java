package com.narudzbine.identity.application;

import com.narudzbine.audit.api.PasswordAudit;
import com.narudzbine.audit.api.TransferAudit;
import com.narudzbine.identity.api.*;
import com.narudzbine.notifications.api.SecurityNotices;
import com.narudzbine.organizations.api.MembershipAccess;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Explicit local prepare / remote write / local complete protocol. Never persist a password or retry a remote write. */
public final class PasswordLifecycleService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final PasswordCredentialMutator provider;
    private final LoginThrottle throttle;
    private final SessionService sessions;
    private final MembershipAccess memberships;
    private final SecurityNotices notices;
    private final PasswordAudit audit;
    private final TransferAudit transfers;
    private final ResetDeliveryCipher cipher;
    private final UuidGenerator ids;
    private final Clock clock;

    public PasswordLifecycleService(JdbcTemplate jdbc, PlatformTransactionManager manager, PasswordCredentialMutator provider,
            LoginThrottle throttle, SessionService sessions, MembershipAccess memberships, SecurityNotices notices,
            PasswordAudit audit, TransferAudit transfers, ResetDeliveryCipher cipher, UuidGenerator ids, Clock clock) {
        this.jdbc=jdbc;transaction=new TransactionTemplate(manager);transaction.setTimeout(10);
        this.provider=provider;this.throttle=throttle;this.sessions=sessions;this.memberships=memberships;
        this.notices=notices;this.audit=audit;this.transfers=transfers;this.cipher=cipher;this.ids=ids;this.clock=clock;
    }

    public void requestReset(String emailInput, String source) {
        LoginThrottle.requireNoTransaction();
        String email=LoginInput.email(emailInput);
        if(!throttle.admitPasswordReset(email,source)) { return; }
        var accounts=jdbc.queryForList("SELECT id FROM account_identity WHERE email=?",UUID.class,email);
        if(accounts.isEmpty()) { return; }
        transaction.executeWithoutResult(status -> {
            Account a=lockAccount(accounts.getFirst());
            if(!a.active() || !email.equals(a.email()) || a.subject()==null) { return; }
            UUID proof=ids.next();String token=SessionSecrets.generate();Instant now=now();
            jdbc.update("UPDATE password_reset_proof SET state='INVALIDATED' WHERE account_id=? AND state='ACTIVE'",a.id());
            jdbc.update("""
                    INSERT INTO password_reset_proof(id,account_id,token_hash,email,security_epoch,credential_generation,state,created_at,expires_at)
                    VALUES (?,?,?,?,?,?,'ACTIVE',?,?)
                    """,proof,a.id(),SessionSecrets.hash(token),email,a.epoch(),a.generation(),time(now),time(now.plusSeconds(1800)));
            jdbc.update("""
                    INSERT INTO password_reset_delivery(proof_id,encrypted_token,locale,state,created_at)
                    SELECT ?,?,COALESCE(a.language_override,o.default_language,'en'),'QUEUED',?
                    FROM account_identity a LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id WHERE a.id=?
                    """,proof,cipher.encrypt(proof,token),time(now),a.id());
        });
    }

    public void reset(String token, String password, String source) {
        LoginThrottle.requireNoTransaction();LoginInput.password(password);
        throttle.begin("reset-completion",source);
        byte[] hash=proofHash(token);
        var accounts=jdbc.queryForList("SELECT account_id FROM password_reset_proof WHERE token_hash=?",UUID.class,hash);
        if(accounts.isEmpty()) { throw failure(PasswordFailure.Reason.TOKEN_INVALID); }
        Operation operation=transaction.execute(status -> {
            Account a=lockAccount(accounts.getFirst());
            var proofs=jdbc.query("""
                    SELECT id FROM password_reset_proof WHERE token_hash=? AND account_id=? AND state='ACTIVE'
                        AND expires_at>? AND email=? AND security_epoch=? AND credential_generation=? FOR UPDATE
                    """,(r,n)->r.getObject(1,UUID.class),hash,a.id(),time(now()),a.email(),a.epoch(),a.generation());
            if(!a.active() || a.subject()==null || proofs.isEmpty()) { throw failure(PasswordFailure.Reason.TOKEN_INVALID); }
            if(a.pending()) { throw failure(PasswordFailure.Reason.REQUEST_IN_PROGRESS); }
            Operation op=prepare(a,"RESET",null,proofs.getFirst());
            jdbc.update("UPDATE password_reset_proof SET state='USED',operation_id=? WHERE id=?",op.id(),proofs.getFirst());
            return op;
        });
        perform(operation,password);
        transaction.executeWithoutResult(status -> complete(operation,false));
    }

    public SessionCredentials change(String token, SessionTransport transport, String csrf, String password) {
        LoginThrottle.requireNoTransaction();LoginInput.password(password);
        UUID account=transaction.execute(status -> sessions.authenticate(token,transport).accountId());
        throttle.admitApi(account,true);
        Operation operation=transaction.execute(status -> {
            var principal=sessions.authenticateForProfileWrite(token,transport);
            if(transport==SessionTransport.BROWSER) { sessions.requireCsrf(token,csrf); }
            if(principal.authenticatedAt().isAfter(now()) || !now().isBefore(principal.authenticatedAt().plusSeconds(300))) {
                throw failure(PasswordFailure.Reason.REAUTHENTICATION_REQUIRED);
            }
            Account a=lockAccount(principal.accountId());
            if(a.subject()==null) { throw failure(PasswordFailure.Reason.DEPENDENCY_UNAVAILABLE); }
            return prepare(a,"CHANGE",principal.sessionId(),null);
        });
        perform(operation,password);
        // A final-commit failure leaves APPLIED and the barrier intact; login reconciles without a second write.
        SessionCredentials result=transaction.execute(status -> complete(operation,true));
        if(result==null) { throw new InvalidSession(); }
        return result;
    }

    /** Called before password verification, so proof can never predate confirmation of an uncertain write. */
    public void reconcileBeforeLogin(String normalizedEmail) {
        LoginThrottle.requireNoTransaction();
        var operations=jdbc.query("""
                SELECT p.id,p.account_id FROM credential_operation p JOIN account_identity a ON a.id=p.account_id
                WHERE a.email=? AND a.credential_operation_pending AND p.kind IN ('RESET','CHANGE') AND p.state IN ('PREPARED','UNKNOWN','APPLIED')
                """,(r,n)->new OperationId(r.getObject(1,UUID.class),r.getObject(2,UUID.class)),normalizedEmail);
        if(operations.isEmpty()) { return; }
        Operation op=transaction.execute(status -> {
            Account a=lockAccount(operations.getFirst().account());
            return a.active()?readOperation(operations.getFirst().id(),a):null;
        });
        if(op==null) { return; }
        if(!op.state().equals("APPLIED")) {
            PasswordCredentialMutator.Outcome observed;
            try { observed=provider.reconcile(op.subject(),op.id()); }
            catch(RuntimeException exception) { observed=PasswordCredentialMutator.Outcome.UNKNOWN; }
            if(observed!=PasswordCredentialMutator.Outcome.APPLIED) { return; }
            recordOutcome(op,PasswordCredentialMutator.Outcome.APPLIED);
        }
        transaction.executeWithoutResult(status -> complete(op,false));
    }

    private Operation prepare(Account a, String kind, UUID currentSession, UUID consumedProof) {
        if(!a.active() || a.pending()) { throw failure(PasswordFailure.Reason.REQUEST_IN_PROGRESS); }
        Instant now=now();UUID id=ids.next();
        jdbc.update("""
                INSERT INTO credential_operation(id,account_id,kind,state,security_epoch,credential_generation,current_session_id,created_at,updated_at)
                VALUES (?,?,?,'PREPARED',?,?,?,?,?)
                """,id,a.id(),kind,a.epoch()+1,a.generation(),currentSession,time(now),time(now));
        jdbc.update("""
                UPDATE account_identity SET credential_operation_pending=true,security_epoch=security_epoch+1,
                    revision=revision+1,updated_at=? WHERE id=?
                """,time(now),a.id());
        jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL AND (?::uuid IS NULL OR id<>?)",
                time(now),a.id(),currentSession,currentSession);
        jdbc.update("UPDATE password_reset_proof SET state='INVALIDATED' WHERE account_id=? AND state='ACTIVE' AND (?::uuid IS NULL OR id<>?)",
                a.id(),consumedProof,consumedProof);
        var retired=jdbc.query("""
                UPDATE ownership_transfer SET state=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'INVALIDATED' END,
                    revision=revision+1,updated_at=? WHERE state='PENDING' AND (issuer_id=? OR recipient_id=?) RETURNING id,state
                """,(r,n)->new RetiredTransfer(r.getObject(1,UUID.class),r.getString(2)),time(now),time(now),a.id(),a.id());
        for(var t:retired) { transfers.changed(a.id(),t.id(),t.state().equals("EXPIRED")?TransferAudit.Action.TRANSFER_EXPIRED:TransferAudit.Action.TRANSFER_INVALIDATED); }
        audit.passwordOperation(a.id(),id,PasswordAudit.Action.PASSWORD_OPERATION_STARTED);
        return new Operation(id,a.id(),a.epoch()+1,a.generation(),a.subject(),"PREPARED");
    }

    private void perform(Operation op, String password) {
        PasswordCredentialMutator.Outcome outcome;
        try { outcome=provider.change(op.subject(),op.id(),password); }
        catch(RuntimeException exception) { outcome=PasswordCredentialMutator.Outcome.UNKNOWN; }
        if(outcome==null) { outcome=PasswordCredentialMutator.Outcome.UNKNOWN; }
        recordOutcome(op,outcome);
        switch(outcome) {
            case APPLIED: return;
            case POLICY_REJECTED: throw failure(PasswordFailure.Reason.PASSWORD_REJECTED);
            default: throw failure(PasswordFailure.Reason.DEPENDENCY_UNAVAILABLE);
        }
    }

    private void recordOutcome(Operation op, PasswordCredentialMutator.Outcome outcome) {
        transaction.executeWithoutResult(status -> {
            Account a=lockAccount(op.account());Operation current=readOperation(op.id(),a);
            if(current.state().equals("COMPLETED") || current.state().equals("APPLIED")) { return; }
            if(!current.state().equals("PREPARED") && !current.state().equals("UNKNOWN")) { throw failure(PasswordFailure.Reason.REQUEST_IN_PROGRESS); }
            requireBarrier(current,a);
            String state=switch(outcome) { case APPLIED -> "APPLIED"; case POLICY_REJECTED, REJECTED -> "REJECTED"; case UNKNOWN -> "UNKNOWN"; };
            jdbc.update("UPDATE credential_operation SET state=?,updated_at=? WHERE id=?",state,time(now()),op.id());
            if(state.equals("REJECTED")) {
                jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL",time(now()),a.id());
                jdbc.update("UPDATE account_identity SET credential_operation_pending=false,revision=revision+1,updated_at=? WHERE id=?",time(now()),a.id());
            }
            audit.passwordOperation(a.id(),op.id(),switch(state) {
                case "APPLIED" -> PasswordAudit.Action.PASSWORD_OPERATION_APPLIED;
                case "REJECTED" -> PasswordAudit.Action.PASSWORD_OPERATION_REJECTED;
                default -> PasswordAudit.Action.PASSWORD_OPERATION_UNCERTAIN;
            });
        });
    }

    private SessionCredentials complete(Operation op, boolean retainCurrentSession) {
        Account a=lockAccount(op.account());Operation current=readOperation(op.id(),a);
        if(current.state().equals("COMPLETED")) { return null; }
        requireBarrier(current,a);
        if(!current.state().equals("APPLIED") || !a.active()) { throw failure(PasswordFailure.Reason.REQUEST_IN_PROGRESS); }
        SessionCredentials result=retainCurrentSession?sessions.completePasswordChange(op.id(),a.id()):null;
        if(!retainCurrentSession || result==null) {
            jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL",time(now()),a.id());
        }
        notices.passwordChanged(a.id(),op.id(),now());
        jdbc.update("UPDATE managed_password_identity SET password_usable=true WHERE account_id=? AND NOT password_usable",a.id());
        jdbc.update("""
                UPDATE account_identity SET credential_operation_pending=false,credential_generation=credential_generation+1,
                    revision=revision+1,updated_at=? WHERE id=?
                """,time(now()),a.id());
        jdbc.update("UPDATE credential_operation SET state='COMPLETED',updated_at=? WHERE id=?",time(now()),op.id());
        audit.passwordOperation(a.id(),op.id(),PasswordAudit.Action.PASSWORD_OPERATION_COMPLETED);
        return result;
    }

    private Account lockAccount(UUID id) {
        var membership=memberships.lockForOrganizationWrite(id);
        return jdbc.queryForObject("""
                SELECT a.*,p.tenant_id,p.provider_user_id FROM account_identity a
                LEFT JOIN managed_password_identity p ON p.account_id=a.id WHERE a.id=? FOR UPDATE OF a
                """,(r,n)->new Account(id,r.getString("email"),r.getLong("security_epoch"),r.getLong("credential_generation"),
                        r.getBoolean("credential_operation_pending"),"ACTIVE".equals(r.getString("state")) && r.getBoolean("email_verified")
                        && ("PLATFORM_ADMIN".equals(r.getString("kind")) || membership.map(m->m.organizationActive()).orElse(false)),
                        r.getObject("tenant_id")==null?null:new PasswordCredentialVerifier.Subject(r.getObject("tenant_id",UUID.class),r.getObject("provider_user_id",UUID.class))),id);
    }
    private Operation readOperation(UUID id,Account a) {
        return jdbc.queryForObject("SELECT * FROM credential_operation WHERE id=? AND account_id=? FOR UPDATE",
                (r,n)->new Operation(id,a.id(),r.getLong("security_epoch"),r.getLong("credential_generation"),a.subject(),r.getString("state")),id,a.id());
    }
    private static void requireBarrier(Operation op, Account a) {
        if(!a.pending() || a.epoch()!=op.epoch() || a.generation()!=op.generation() || a.subject()==null) { throw failure(PasswordFailure.Reason.REQUEST_IN_PROGRESS); }
    }
    private static byte[] proofHash(String token) {
        try { return SessionSecrets.hash(token); }
        catch(InvalidSession exception) { throw failure(PasswordFailure.Reason.TOKEN_INVALID); }
    }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private static Timestamp time(Instant i) { return Timestamp.from(i); }
    private static PasswordFailure failure(PasswordFailure.Reason r) { return new PasswordFailure(r); }
    private record Account(UUID id,String email,long epoch,long generation,boolean pending,boolean active,PasswordCredentialVerifier.Subject subject) {
        @Override public String toString() { return "PasswordAccount[redacted]"; }
    }
    private record Operation(UUID id,UUID account,long epoch,long generation,PasswordCredentialVerifier.Subject subject,String state) { }
    private record OperationId(UUID id,UUID account) { }
    private record RetiredTransfer(UUID id,String state) { }
}
