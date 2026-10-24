package com.narudzbine.identity.application;

import com.narudzbine.audit.api.SessionAudit;
import com.narudzbine.audit.api.SessionAuditAction;
import com.narudzbine.identity.api.AuthenticatedSession;
import com.narudzbine.identity.api.InaccessibleSession;
import com.narudzbine.identity.api.InvalidCsrf;
import com.narudzbine.identity.api.InvalidSession;
import com.narudzbine.identity.api.SessionCredentials;
import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.api.SessionView;
import com.narudzbine.identity.api.VerifiedPasswordProof;
import com.narudzbine.organizations.api.MembershipAccess;
import com.narudzbine.shared.api.UuidGenerator;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Comparator;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class SessionService {
    private final JdbcTemplate jdbc;
    private final MembershipAccess memberships;
    private final Clock clock;
    private final UuidGenerator ids;
    private final SessionAudit audit;

    public SessionService(JdbcTemplate jdbc, MembershipAccess memberships, Clock clock, UuidGenerator ids, SessionAudit audit) {
        this.jdbc = jdbc;
        this.memberships = memberships;
        this.clock = clock;
        this.ids = ids;
        this.audit = audit;
    }

    public SessionCredentials issue(VerifiedPasswordProof proof, SessionTransport transport, String deviceLabel) {
        return issue(proof,transport,deviceLabel,null);
    }
    public SessionCredentials issueExternal(com.narudzbine.identity.api.VerifiedExternalProof proof,SessionTransport transport,String label) {
        return issue(new VerifiedPasswordProof(proof.accountId(),proof.securityEpoch(),proof.credentialGeneration(),proof.authenticatedAt()),transport,label,proof.identityId());
    }
    private SessionCredentials issue(VerifiedPasswordProof proof,SessionTransport transport,String deviceLabel,UUID external) {
        requireTransaction();
        Objects.requireNonNull(transport);
        String label = normalizeLabel(deviceLabel);
        Account account = lockAccount(proof.accountId());
        Instant now = now();
        requireProof(proof, account, now);
        requireMethod(account.id(),external);
        List<StoredSession> active = activeSessions(account, now);
        int evictions = Math.max(0, active.size() - account.cap() + 1);
        for (int index = 0; index < evictions; index++) {
            revoke(active.get(index).id(), account.id(), now, SessionAuditAction.SESSION_EVICTED);
        }
        UUID id = ids.next();
        String token = SessionSecrets.generate();
        String csrf = transport == SessionTransport.BROWSER ? SessionSecrets.csrf(token) : null;
        Instant absoluteExpiry = now.plus(account.absoluteLifetime());
        jdbc.update("""
                INSERT INTO application_session (id, account_id, transport, token_hash, csrf_token_hash, device_label,
                    created_at, last_qualified_activity_at, absolute_expires_at, auth_at, auth_method_type,
                    auth_method_id, credential_generation, security_epoch)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id, account.id(), transport.name(), SessionSecrets.hash(token),
                csrf == null ? null : SessionSecrets.hash(csrf), label, time(now), time(now), time(absoluteExpiry),
                time(proof.authenticatedAt().truncatedTo(ChronoUnit.MILLIS)),external==null?"PASSWORD":"EXTERNAL",external,account.generation(), account.epoch());
        audit.record(SessionAuditAction.SESSION_CREATED, account.id(), id);
        return new SessionCredentials(new SessionView(id, label, now, now,
                now.plus(account.idleLifetime()), true), token, csrf);
    }

    /** Business organization mutation guard precedes account/session locks; platform accounts are excluded. */
    public AuthenticatedSession authenticateForOrganizationWrite(String token, SessionTransport transport) {
        var principal = authenticateForProfileWrite(token, transport);
        if (principal.platformAdministrator()) {
            throw new com.narudzbine.identity.api.BusinessAccessDenied(
                    com.narudzbine.identity.api.BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
        }
        return principal;
    }

    /** Business reads retain shared organization authorization and exclude platform membership. */
    public AuthenticatedSession authenticateForOrganizationRead(String token, SessionTransport transport) {
        var principal = authenticate(token, transport);
        if (principal.platformAdministrator()) {
            throw new com.narudzbine.identity.api.BusinessAccessDenied(
                    com.narudzbine.identity.api.BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
        }
        return principal;
    }

    /** Lock only own-organization actor/target identities, in database UUID order, before any session lock. */
    public AuthenticatedSession authenticateForMemberWrite(String token, SessionTransport transport, UUID target) {
        requireTransaction();
        var actors=jdbc.query("SELECT account_id FROM application_session WHERE token_hash=?",
                (r,n) -> r.getObject(1,UUID.class),SessionSecrets.hash(token));
        if (actors.isEmpty()) { throw new InvalidSession(); }
        UUID actor=actors.getFirst();
        var membership=memberships.lockForOrganizationWrite(actor).orElseThrow(() ->
                new com.narudzbine.identity.api.MemberFailure(com.narudzbine.identity.api.MemberFailure.Reason.NOT_FOUND));
        jdbc.query("""
                SELECT a.id FROM account_identity a JOIN business_account b ON b.id=a.id
                WHERE b.organization_id=? AND a.id IN (?,?) ORDER BY a.id FOR UPDATE OF a
                """,(r,n) -> r.getObject(1,UUID.class),membership.organizationId(),actor,target);
        return authenticate(token,transport);
    }

    /** Trading commands acquire both domestic organization guards before any actor/issuer/session lock. */
    public AuthenticatedSession authenticateForTradingWrite(String token,SessionTransport transport,UUID vendor,UUID buyer,UUID issuer){
        return authenticateForTrading(token,transport,vendor,buyer,issuer,true);
    }

    /** Coherent trading reads share the sorted party guards while still excluding state changes. */
    public AuthenticatedSession authenticateForTradingRead(String token,SessionTransport transport,UUID vendor,UUID buyer){
        return authenticateForTrading(token,transport,vendor,buyer,null,false);
    }

    private AuthenticatedSession authenticateForTrading(String token,SessionTransport transport,UUID vendor,UUID buyer,UUID issuer,boolean write){
        requireTransaction();var actors=jdbc.queryForList("SELECT s.account_id,b.organization_id FROM application_session s JOIN business_account b ON b.id=s.account_id WHERE s.token_hash=?",SessionSecrets.hash(token));
        if(actors.isEmpty()){throw new InvalidSession();}UUID actor=(UUID)actors.getFirst().get("account_id"),own=(UUID)actors.getFirst().get("organization_id");if(!own.equals(vendor)&&!own.equals(buyer)){throw new com.narudzbine.identity.api.SetupFailure(com.narudzbine.identity.api.SetupFailure.Reason.NOT_FOUND);}
        jdbc.queryForList("SELECT id FROM organization WHERE id IN (?,?) ORDER BY id FOR "+(write?"UPDATE":"SHARE"),UUID.class,vendor,buyer);
        if(write)jdbc.queryForList("SELECT a.id FROM account_identity a JOIN business_account b ON b.id=a.id WHERE b.organization_id IN (?,?) AND a.id IN (?,?) ORDER BY a.id FOR UPDATE OF a",UUID.class,vendor,buyer,actor,issuer);
        return authenticate(token,transport);
    }

    /** Workspace reads acquire a bounded page's vendor guards and own buyer before actor/session locks. */
    public AuthenticatedSession authenticateForWorkspace(String token,SessionTransport transport,UUID buyer,java.util.Set<UUID> vendors){
        requireTransaction();
        var own=jdbc.queryForList("SELECT b.organization_id FROM application_session s JOIN business_account b ON b.id=s.account_id WHERE s.token_hash=?",UUID.class,SessionSecrets.hash(token));
        if(own.isEmpty()){throw new InvalidSession();}
        if(!own.getFirst().equals(buyer)||vendors.size()>100){throw new com.narudzbine.identity.api.BusinessAccessDenied(com.narudzbine.identity.api.BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);}
        var ids=new java.util.HashSet<UUID>(vendors);ids.add(buyer);
        var placeholders=String.join(",",java.util.Collections.nCopies(ids.size(),"?"));
        jdbc.queryForList("SELECT id FROM organization WHERE id IN ("+placeholders+") ORDER BY id FOR UPDATE",UUID.class,ids.toArray());
        return authenticate(token,transport);
    }

    /** Platform trading writes use the same organization-first order as business writes. */
    public AuthenticatedSession authenticateForAdministrativeTradingWrite(String token,SessionTransport transport,UUID vendor,UUID buyer){
        requireTransaction();
        jdbc.queryForList("SELECT id FROM organization WHERE id IN (?,?) ORDER BY id FOR UPDATE",UUID.class,vendor,buyer);
        var session=authenticate(token,transport);
        if(!session.platformAdministrator()){throw new com.narudzbine.identity.api.SetupFailure(com.narudzbine.identity.api.SetupFailure.Reason.FORBIDDEN);}
        return session;
    }

    public AuthenticatedSession authenticateForTransferWrite(String token,SessionTransport transport,UUID transfer) {
        requireTransaction();
        var actors=jdbc.query("SELECT account_id FROM application_session WHERE token_hash=?",(r,n) -> r.getObject(1,UUID.class),SessionSecrets.hash(token));
        if(actors.isEmpty()) { throw new InvalidSession(); }UUID actor=actors.getFirst();
        var membership=memberships.lockForOrganizationWrite(actor).orElseThrow(() ->
                new com.narudzbine.identity.api.TransferFailure(com.narudzbine.identity.api.TransferFailure.Reason.NOT_FOUND));
        jdbc.query("""
                SELECT a.id FROM account_identity a JOIN business_account b ON b.id=a.id
                WHERE b.organization_id=? AND (a.id=? OR a.id IN (
                    SELECT issuer_id FROM ownership_transfer WHERE organization_id=? AND id=?
                    UNION SELECT recipient_id FROM ownership_transfer WHERE organization_id=? AND id=?))
                ORDER BY a.id FOR UPDATE OF a
                """,(r,n) -> r.getObject(1,UUID.class),membership.organizationId(),actor,membership.organizationId(),transfer,membership.organizationId(),transfer);
        return authenticate(token,transport);
    }

    public boolean isPlatformAccount(UUID actor){requireTransaction();return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM platform_account WHERE id=?)",Boolean.class,actor));}
    /** Organization state commands fence every member's session writer before current administrator authority. */
    public AuthenticatedSession authenticateForAdministrativeStateWrite(String token,SessionTransport transport,UUID organization){
        requireTransaction();var actors=jdbc.queryForList("SELECT s.account_id FROM application_session s JOIN platform_account p ON p.id=s.account_id WHERE s.token_hash=?",UUID.class,SessionSecrets.hash(token));if(actors.isEmpty())throw new InvalidSession();
        jdbc.queryForList("SELECT id FROM organization WHERE id=? FOR UPDATE",UUID.class,organization);
        jdbc.queryForList("SELECT a.id FROM account_identity a LEFT JOIN business_account b ON b.id=a.id WHERE a.id=? OR b.organization_id=? ORDER BY a.id FOR UPDATE OF a",UUID.class,actors.getFirst(),organization);
        var principal=authenticate(token,transport);if(!principal.platformAdministrator())throw new InvalidSession();return principal;
    }
    /** Caller holds target organization and all member identity guards; lifecycle audit owns actual actor attribution. */
    public void revokeOrganizationSessions(UUID organization){requireTransaction();jdbc.update("UPDATE application_session SET revoked_at=? WHERE revoked_at IS NULL AND account_id IN(SELECT id FROM business_account WHERE organization_id=?)",time(now()),organization);}
    public AuthenticatedSession authenticateForAdministrativeOrganizationWrite(String token,SessionTransport transport,UUID organization){return authenticateForAdministrativeMemberWrite(token,transport,organization,null);}
    /** Administrative staff commands lock target organization, then sorted administrator/target identities, then session. */
    public AuthenticatedSession authenticateForAdministrativeMemberWrite(String token,SessionTransport transport,UUID organization,UUID target){
        requireTransaction();var actors=jdbc.queryForList("SELECT s.account_id FROM application_session s JOIN platform_account p ON p.id=s.account_id WHERE s.token_hash=?",UUID.class,SessionSecrets.hash(token));if(actors.isEmpty())throw new InvalidSession();UUID actor=actors.getFirst();
        jdbc.queryForList("SELECT id FROM organization WHERE id=? FOR UPDATE",UUID.class,organization);
        jdbc.queryForList("SELECT a.id FROM account_identity a LEFT JOIN business_account b ON b.id=a.id WHERE a.id=? OR(a.id=? AND b.organization_id=?) ORDER BY a.id FOR UPDATE OF a",UUID.class,actor,target,organization);
        var principal=authenticate(token,transport);if(!principal.platformAdministrator())throw new InvalidSession();return principal;
    }

    /** Own profile edits also support platform accounts, which have no organization to lock. */
    public AuthenticatedSession authenticateForProfileWrite(String token, SessionTransport transport) {
        requireTransaction();
        var accountIds = jdbc.query("SELECT account_id FROM application_session WHERE token_hash = ?",
                (row, index) -> row.getObject(1, UUID.class), SessionSecrets.hash(token));
        if (accountIds.isEmpty()) { throw new InvalidSession(); }
        memberships.lockForOrganizationWrite(accountIds.getFirst());
        return authenticate(token, transport);
    }

    public AuthenticatedSession authenticate(String token, SessionTransport transport) {
        var locked = lockSession(token, transport);
        return new AuthenticatedSession(locked.session().id(), locked.account().id(), locked.account().platform(),
                locked.session().authAt());
    }

    /** Narrow pending-email inspection/reconciliation only; never use this principal for ordinary business writes. */
    public AuthenticatedSession authenticateForEmailChange(String token,SessionTransport transport,UUID change,String csrf,boolean mutation) {
        requireTransaction();
        byte[] hash=SessionSecrets.hash(token);
        var actors=jdbc.queryForList("SELECT account_id FROM application_session WHERE token_hash=?",UUID.class,hash);
        if(actors.isEmpty()) { throw new InvalidSession(); }UUID actor=actors.getFirst();
        var membership=memberships.lockForOrganizationWrite(actor);
        var rows=jdbc.queryForList("SELECT * FROM account_identity WHERE id=? FOR UPDATE",actor);
        if(rows.isEmpty()) { throw new InvalidSession(); }var a=rows.getFirst();
        if(!Boolean.TRUE.equals(a.get("credential_operation_pending"))) {
            var principal=authenticate(token,transport);
            if(mutation && transport==SessionTransport.BROWSER) { requireCsrf(token,csrf); }
            return principal;
        }
        boolean platform="PLATFORM_ADMIN".equals(a.get("kind"));
        if(!"ACTIVE".equals(a.get("state")) || !Boolean.TRUE.equals(a.get("email_verified"))
                || (!platform && !membership.map(m->m.organizationActive()).orElse(false))) { throw new InvalidSession(); }
        var stored=jdbc.query("""
                SELECT s.* FROM application_session s JOIN credential_operation p ON p.current_session_id=s.id
                JOIN email_change e ON e.operation_id=p.id
                WHERE s.token_hash=? AND s.account_id=? AND p.account_id=s.account_id AND e.id=? AND e.account_id=s.account_id
                    AND p.kind='EMAIL' AND p.state IN ('PREPARED','UNKNOWN','APPLIED') AND e.state='RECONCILING'
                    AND p.security_epoch=? AND p.credential_generation=?
                    AND s.security_epoch=p.security_epoch-1 AND s.credential_generation=p.credential_generation FOR UPDATE OF s
                """,SessionService::map,hash,actor,change,a.get("security_epoch"),a.get("credential_generation"));
        if(stored.isEmpty()) { throw new InvalidSession(); }var s=stored.getFirst();
        var account=new Account(actor,platform,((Number)a.get("security_epoch")).longValue(),((Number)a.get("credential_generation")).longValue());
        if(s.transport()!=transport || s.revoked() || !now().isBefore(s.absoluteExpiry())
                || !now().isBefore(s.lastActivity().plus(account.idleLifetime()))) { throw new InvalidSession(); }
        if(mutation && transport==SessionTransport.BROWSER) {
            byte[] submitted;try { submitted=SessionSecrets.hash(csrf); } catch(InvalidSession ex) { throw new InvalidCsrf(); }
            if(!MessageDigest.isEqual(s.csrfHash(),submitted)) { throw new InvalidCsrf(); }
        }
        return new AuthenticatedSession(s.id(),actor,platform,s.authAt());
    }

    /** Call after a qualifying command succeeds, in the same transaction; never call for background traffic. */
    public void recordSuccessfulActivity(String token, SessionTransport transport) {
        var locked = lockSession(token, transport);
        jdbc.update("""
                UPDATE application_session SET last_qualified_activity_at = GREATEST(last_qualified_activity_at, ?)
                WHERE id = ? AND account_id = ?
                """, time(now()), locked.session().id(), locked.account().id());
    }

    public SessionCredentials reauthenticate(String token, SessionTransport transport, VerifiedPasswordProof proof) {
        var locked = lockSession(token, transport);
        return rotate(locked,proof,null);
    }
    public AuthenticatedSession authenticateExternalContinuation(UUID session,byte[] expectedTokenHash,SessionTransport transport) {
        var locked=lockSessionHash(expectedTokenHash,transport);
        if(!locked.session().id().equals(session)) { throw new InvalidSession(); }
        return new AuthenticatedSession(session,locked.account().id(),locked.account().platform(),locked.session().authAt());
    }
    public SessionCredentials reauthenticateExternalContinuation(UUID session,byte[] expectedTokenHash,SessionTransport transport,
            com.narudzbine.identity.api.VerifiedExternalProof proof) {
        var locked=lockSessionHash(expectedTokenHash,transport);
        if(!locked.session().id().equals(session)) { throw new InvalidSession(); }
        return rotate(locked,new VerifiedPasswordProof(proof.accountId(),proof.securityEpoch(),proof.credentialGeneration(),proof.authenticatedAt()),proof.identityId());
    }
    private SessionCredentials rotate(LockedSession locked,VerifiedPasswordProof proof,UUID external) {
        Instant now = now();
        requireProof(proof, locked.account(), now);
        requireMethod(locked.account().id(),external);
        String replacement = SessionSecrets.generate();
        String csrf = locked.session().transport() == SessionTransport.BROWSER ? SessionSecrets.csrf(replacement) : null;
        jdbc.update("""
                UPDATE application_session SET token_hash = ?, csrf_token_hash = ?, auth_at = ?,
                    auth_method_type = ?, auth_method_id = ?
                WHERE id = ? AND account_id = ?
                """, SessionSecrets.hash(replacement), csrf == null ? null : SessionSecrets.hash(csrf),
                time(proof.authenticatedAt().truncatedTo(ChronoUnit.MILLIS)),external==null?"PASSWORD":"EXTERNAL",external,locked.session().id(), locked.account().id());
        audit.record(SessionAuditAction.SESSION_REAUTHENTICATED, locked.account().id(), locked.session().id());
        return new SessionCredentials(view(locked.session(), locked.account(), locked.session().id()), replacement, csrf);
    }

    /** Only the applied credential operation may retain its original, still-live session. Caller holds account lock. */
    public SessionCredentials completePasswordChange(UUID operation, UUID accountId) {
        requireTransaction();
        var eligible=jdbc.query("""
                SELECT s.* FROM credential_operation p JOIN application_session s ON s.id=p.current_session_id
                JOIN account_identity a ON a.id=p.account_id
                WHERE p.id=? AND p.account_id=? AND p.state='APPLIED' AND p.kind='CHANGE'
                    AND a.credential_operation_pending AND a.state='ACTIVE' AND a.email_verified
                    AND a.security_epoch=p.security_epoch AND a.credential_generation=p.credential_generation
                    AND s.account_id=a.id AND s.revoked_at IS NULL FOR UPDATE OF s
                """,SessionService::map,operation,accountId);
        if(eligible.isEmpty()) { return null; }
        var s=eligible.getFirst();
        boolean platform="PLATFORM_ADMIN".equals(jdbc.queryForObject("SELECT kind FROM account_identity WHERE id=?",String.class,accountId));
        var a=new Account(accountId,platform,s.epoch()+1,s.generation()+1);
        Instant now=now();
        if(!now.isBefore(s.absoluteExpiry()) || !now.isBefore(s.lastActivity().plus(a.idleLifetime()))) {
            revoke(s.id(),accountId,now,SessionAuditAction.SESSION_REVOKED);return null;
        }
        String token=SessionSecrets.generate();String csrf=s.transport()==SessionTransport.BROWSER?SessionSecrets.csrf(token):null;
        jdbc.update("""
                UPDATE application_session SET token_hash=?,csrf_token_hash=?,security_epoch=?,credential_generation=?,
                    last_qualified_activity_at=GREATEST(last_qualified_activity_at,?) WHERE id=?
                """,SessionSecrets.hash(token),csrf==null?null:SessionSecrets.hash(csrf),a.epoch(),a.generation(),time(now),s.id());
        audit.record(SessionAuditAction.SESSION_PASSWORD_ROTATED,accountId,s.id());
        return new SessionCredentials(new SessionView(s.id(),s.label(),s.createdAt(),now,
                now.plus(a.idleLifetime()).isBefore(s.absoluteExpiry())?now.plus(a.idleLifetime()):s.absoluteExpiry(),true),token,csrf);
    }

    /** Origin validation is additionally mandatory in the browser HTTP adapter. */
    public void requireCsrf(String token, String csrfToken) {
        var locked = lockSession(token, SessionTransport.BROWSER);
        byte[] submitted;
        try {
            submitted = SessionSecrets.hash(csrfToken);
        } catch (InvalidSession exception) {
            throw new InvalidCsrf();
        }
        if (!MessageDigest.isEqual(locked.session().csrfHash(), submitted)) {
            throw new InvalidCsrf();
        }
    }

    public List<SessionView> list(String token, SessionTransport transport) {
        var locked = lockSession(token, transport);
        return activeSessions(locked.account(), now()).stream()
                .map(session -> view(session, locked.account(), locked.session().id()))
                .sorted(Comparator.comparing(SessionView::createdAt).reversed()
                        .thenComparing(session -> session.id().toString())).toList();
    }

    public String csrfToken(String token) {
        String csrf = SessionSecrets.csrf(token);
        requireCsrf(token, csrf);
        return csrf;
    }

    /** Desired-state logout retries validate the original stored credential, including its CSRF binding. */
    public void logout(String token, SessionTransport transport, String csrfToken) {
        requireTransaction();
        byte[] hash = SessionSecrets.hash(token);
        var rows = jdbc.query("SELECT account_id FROM application_session WHERE token_hash = ?",
                (row, index) -> row.getObject(1, UUID.class), hash);
        if (rows.isEmpty()) { throw new InvalidSession(); }
        UUID accountId = rows.getFirst();
        jdbc.queryForObject("SELECT id FROM account_identity WHERE id = ? FOR UPDATE", UUID.class, accountId);
        var stored = jdbc.query("SELECT * FROM application_session WHERE token_hash = ? FOR UPDATE", SessionService::map, hash);
        if (stored.isEmpty() || stored.getFirst().transport() != transport) { throw new InvalidSession(); }
        if (transport == SessionTransport.BROWSER) {
            byte[] submitted;
            try { submitted = SessionSecrets.hash(csrfToken); }
            catch (InvalidSession exception) { throw new InvalidCsrf(); }
            if (!MessageDigest.isEqual(stored.getFirst().csrfHash(), submitted)) { throw new InvalidCsrf(); }
        }
        revoke(stored.getFirst().id(), accountId, now(), SessionAuditAction.SESSION_LOGGED_OUT);
    }

    public void revokeCurrent(String token, SessionTransport transport) {
        var locked = lockSession(token, transport);
        revoke(locked.session().id(), locked.account().id(), now(), SessionAuditAction.SESSION_REVOKED);
    }

    public void revokeAll(String token, SessionTransport transport) {
        var locked = lockSession(token, transport);
        var changed = jdbc.query("""
                UPDATE application_session SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL
                RETURNING id
                """, (row, index) -> row.getObject(1, UUID.class), time(now()), locked.account().id());
        for (UUID id : changed) {
            audit.record(SessionAuditAction.SESSION_REVOKED_ALL, locked.account().id(), id);
        }
    }

    public void revokeOther(String token, SessionTransport transport, UUID targetSessionId) {
        var locked = lockSession(token, transport);
        if (jdbc.queryForObject("SELECT count(*) FROM application_session WHERE id = ? AND account_id = ?",
                Integer.class, targetSessionId, locked.account().id()) != 1) {
            throw new InaccessibleSession();
        }
        revoke(targetSessionId, locked.account().id(), now(), SessionAuditAction.SESSION_REVOKED);
    }

    /** Nonlocking technical replay admission only; never authorizes business access or committing actions. */
    public UUID replayAdmissionAccount(String token,SessionTransport transport){
        requireTransaction();var accountIds=jdbc.queryForList("SELECT account_id FROM application_session WHERE token_hash=?",UUID.class,SessionSecrets.hash(token));if(accountIds.isEmpty()){throw new InvalidSession();}UUID actor=accountIds.getFirst();var rows=jdbc.query("SELECT * FROM application_session WHERE token_hash=?",SessionService::map,SessionSecrets.hash(token));if(rows.isEmpty()){throw new InvalidSession();}var session=rows.getFirst();
        var accounts=jdbc.queryForList("SELECT a.*,o.state AS organization_state FROM account_identity a LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id WHERE a.id=?",actor);
        if(accounts.isEmpty()){throw new InvalidSession();}var r=accounts.getFirst();boolean platform="PLATFORM_ADMIN".equals(r.get("kind"));if(!"ACTIVE".equals(r.get("state"))||!Boolean.TRUE.equals(r.get("email_verified"))||Boolean.TRUE.equals(r.get("credential_operation_pending"))||!platform&&!"ACTIVE".equals(r.get("organization_state"))){throw new InvalidSession();}
        var account=new Account(actor,platform,((Number)r.get("security_epoch")).longValue(),((Number)r.get("credential_generation")).longValue());requireSession(account,session,transport);return account.id();
    }

    public record BusinessAdmission(UUID actor,UUID organization){}
    /** Nonlocking routing only; final current scope is acquired in the committing transaction. */
    public BusinessAdmission replayAdmissionBusiness(String token,SessionTransport transport){UUID actor=replayAdmissionAccount(token,transport);var rows=jdbc.queryForList("SELECT organization_id FROM business_account WHERE id=?",UUID.class,actor);if(rows.isEmpty()){throw new com.narudzbine.identity.api.BusinessAccessDenied(com.narudzbine.identity.api.BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);}return new BusinessAdmission(actor,rows.getFirst());}
    public record BuyerAdmission(UUID actor,UUID buyer){}
    /** Technical routing only; committing transaction must reacquire all current authority. */
    public record VendorAdmission(UUID actor,UUID vendor){}
    public VendorAdmission replayAdmissionVendor(String token,SessionTransport transport){UUID actor=replayAdmissionAccount(token,transport);var rows=jdbc.query("SELECT b.organization_id FROM business_account b JOIN organization o ON o.id=b.organization_id WHERE b.id=? AND o.type='VENDOR'",(r,n)->r.getObject(1,UUID.class),actor);if(rows.isEmpty()){throw new com.narudzbine.identity.api.BusinessAccessDenied(com.narudzbine.identity.api.BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);}return new VendorAdmission(actor,rows.getFirst());}
    public BuyerAdmission replayAdmissionBuyer(String token,SessionTransport transport){UUID actor=replayAdmissionAccount(token,transport);var rows=jdbc.query("SELECT b.organization_id FROM business_account b JOIN organization o ON o.id=b.organization_id WHERE b.id=? AND o.type='BUYER'",(r,n)->r.getObject(1,UUID.class),actor);if(rows.isEmpty()){throw new com.narudzbine.identity.api.BusinessAccessDenied(com.narudzbine.identity.api.BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);}return new BuyerAdmission(actor,rows.getFirst());}
    /** Only after the caller's current locked session and business authorization. */
    public String currentDisplayName(UUID actor){requireTransaction();return jdbc.queryForObject("SELECT display_name FROM account_identity WHERE id=?",String.class,actor);}

    private LockedSession lockSession(String token, SessionTransport transport) {
        return lockSessionHash(SessionSecrets.hash(token),transport);
    }
    private LockedSession lockSessionHash(byte[] hash,SessionTransport transport) {
        requireTransaction();
        Objects.requireNonNull(transport);
        var accountIds = jdbc.query("SELECT account_id FROM application_session WHERE token_hash = ?",
                (row, index) -> row.getObject(1, UUID.class), hash);
        if (accountIds.isEmpty()) {
            throw new InvalidSession();
        }
        Account account = lockAccount(accountIds.getFirst());
        var sessions = jdbc.query("""
                SELECT * FROM application_session WHERE account_id = ? AND token_hash = ? FOR UPDATE
                """, SessionService::map, account.id(), hash);
        if (sessions.isEmpty()) {
            throw new InvalidSession();
        }
        StoredSession session = sessions.getFirst();
        requireSession(account,session,transport);
        return new LockedSession(account, session);
    }

    private void requireSession(Account account,StoredSession session,SessionTransport transport){
        Instant now = now();
        if (session.transport() != transport || session.revoked() || session.epoch() != account.epoch()
                || session.generation() != account.generation() || !now.isBefore(session.absoluteExpiry())
                || !now.isBefore(session.lastActivity().plus(account.idleLifetime()))) {
            throw new InvalidSession();
        }
        requireMethod(account.id(),session.externalMethod());
    }

    private void requireMethod(UUID account,UUID external) {
        if(external==null) {
            if(jdbc.queryForObject("SELECT count(*) FROM managed_password_identity WHERE account_id=? AND NOT password_usable",Integer.class,account)>0) { throw new InvalidSession(); }
        } else if(jdbc.queryForObject("SELECT count(*) FROM external_identity WHERE id=? AND account_id=? AND active",Integer.class,external,account)!=1) { throw new InvalidSession(); }
    }

    private Account lockAccount(UUID id) {
        var kinds = jdbc.query("SELECT kind FROM account_identity WHERE id = ?",
                (row, index) -> row.getString(1), id);
        if (kinds.isEmpty()) {
            throw new InvalidSession();
        }
        boolean platform = "PLATFORM_ADMIN".equals(kinds.getFirst());
        if (!platform) {
            var membership = memberships.lockForAuthorization(id).orElseThrow(InvalidSession::new);
            if (!membership.organizationActive()) {
                throw new InvalidSession();
            }
        }
        var accounts = jdbc.query("""
                SELECT security_epoch, credential_generation, state, email_verified, credential_operation_pending
                FROM account_identity WHERE id = ? FOR UPDATE
                """, (row, index) -> {
                    if (!"ACTIVE".equals(row.getString("state")) || !row.getBoolean("email_verified")
                            || row.getBoolean("credential_operation_pending")) {
                        throw new InvalidSession();
                    }
                    return new Account(id, platform, row.getLong("security_epoch"), row.getLong("credential_generation"));
                }, id);
        if (accounts.isEmpty()) {
            throw new InvalidSession();
        }
        return accounts.getFirst();
    }

    private void requireProof(VerifiedPasswordProof proof, Account account, Instant now) {
        if (!account.id().equals(proof.accountId()) || proof.securityEpoch() != account.epoch()
                || proof.credentialGeneration() != account.generation() || proof.authenticatedAt() == null
                || proof.authenticatedAt().truncatedTo(ChronoUnit.MILLIS).isAfter(now)
                || !now.isBefore(proof.authenticatedAt().truncatedTo(ChronoUnit.MILLIS).plusSeconds(60))) {
            throw new InvalidSession();
        }
    }

    private List<StoredSession> activeSessions(Account account, Instant now) {
        return jdbc.query("""
                SELECT * FROM application_session WHERE account_id = ? AND revoked_at IS NULL
                    AND absolute_expires_at > ? AND last_qualified_activity_at > ?
                    AND security_epoch = ? AND credential_generation = ? ORDER BY created_at, id
                """, SessionService::map, account.id(), time(now), time(now.minus(account.idleLifetime())),
                account.epoch(), account.generation());
    }

    private void revoke(UUID sessionId, UUID accountId, Instant now, SessionAuditAction action) {
        int changed = jdbc.update("""
                UPDATE application_session SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL
                """, time(now), sessionId, accountId);
        if (changed == 1) {
            audit.record(action, accountId, sessionId);
        }
    }

    private static SessionView view(StoredSession session, Account account, UUID currentSession) {
        Instant idleExpiry = session.lastActivity().plus(account.idleLifetime());
        Instant expiry = idleExpiry.isBefore(session.absoluteExpiry()) ? idleExpiry : session.absoluteExpiry();
        return new SessionView(session.id(), session.label(), session.createdAt(), session.lastActivity(), expiry,
                session.id().equals(currentSession));
    }

    private static StoredSession map(ResultSet row, int index) throws SQLException {
        return new StoredSession(row.getObject("id", UUID.class), SessionTransport.valueOf(row.getString("transport")),
                row.getBytes("csrf_token_hash"), row.getString("device_label"), row.getTimestamp("created_at").toInstant(),
                row.getTimestamp("last_qualified_activity_at").toInstant(), row.getTimestamp("absolute_expires_at").toInstant(),
                row.getTimestamp("auth_at").toInstant(), row.getTimestamp("revoked_at") != null,
                row.getLong("security_epoch"), row.getLong("credential_generation"),row.getObject("auth_method_id",UUID.class));
    }

    public static String normalizeLabel(String label) {
        if (label == null) {
            throw new IllegalArgumentException("Device label is required.");
        }
        String normalized = Normalizer.normalize(label.strip(), Normalizer.Form.NFC);
        if (normalized.isBlank() || normalized.codePointCount(0, normalized.length()) > 100
                || normalized.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("Device label is invalid.");
        }
        return normalized;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private static Timestamp time(Instant instant) {
        return Timestamp.from(instant);
    }

    private static void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("Session operations require a writable transaction.");
        }
    }

    private record Account(UUID id, boolean platform, long epoch, long generation) {
        int cap() { return platform ? 3 : 10; }
        Duration idleLifetime() { return platform ? Duration.ofMinutes(30) : Duration.ofDays(7); }
        Duration absoluteLifetime() { return platform ? Duration.ofHours(12) : Duration.ofDays(30); }
    }

    private record StoredSession(UUID id, SessionTransport transport, byte[] csrfHash, String label, Instant createdAt,
            Instant lastActivity, Instant absoluteExpiry, Instant authAt, boolean revoked, long epoch, long generation,UUID externalMethod) {
    }

    private record LockedSession(Account account, StoredSession session) {
    }
}
