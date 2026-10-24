package com.narudzbine.identity.application;

import com.narudzbine.audit.api.TransferAudit;
import com.narudzbine.identity.api.*;
import com.narudzbine.notifications.api.SecurityNotices;
import com.narudzbine.organizations.api.BusinessRole;
import com.narudzbine.shared.api.ResourceRevisions;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Caller holds organization and sorted participant identities before session/transfer locks. */
@Transactional(propagation=Propagation.MANDATORY)
public class OwnershipService {
    private final JdbcTemplate jdbc;
    private final ResourceRevisions revisions;
    private final UuidGenerator ids;
    private final Clock clock;
    private final TransferAudit audit;
    private final SecurityNotices notices;
    public OwnershipService(JdbcTemplate jdbc,ResourceRevisions revisions,UuidGenerator ids,Clock clock,TransferAudit audit,SecurityNotices notices) {
        this.jdbc=jdbc;this.revisions=revisions;this.ids=ids;this.clock=clock;this.audit=audit;this.notices=notices;
    }
    public Creation request(BusinessScope actor,AuthenticatedSession principal,UUID recipient,String expected) {
        Instant now=now();owner(actor);fresh(principal,now);
        var receipts=jdbc.query("SELECT id,recipient_id FROM ownership_transfer WHERE organization_id=? AND issuer_id=? AND request_revision_token=?",
                (r,n) -> new Receipt(r.getObject(1,UUID.class),r.getObject(2,UUID.class)),actor.organizationId(),actor.accountId(),expected);
        if(!receipts.isEmpty()) {
            var receipt=receipts.getFirst();if(!recipient.equals(receipt.recipient())) { throw failure(TransferFailure.Reason.IDEMPOTENCY_MISMATCH); }
            return new Creation(view(read(actor.organizationId(),receipt.id()),now),true);
        }
        long revision=jdbc.queryForObject("SELECT revision FROM organization WHERE id=?",Long.class,actor.organizationId());
        if(!revisions.matches("organization/v1",actor.organizationId(),revision,expected)) { throw new RevisionConflict(revisions.encode("organization/v1",actor.organizationId(),revision)); }
        var recipients=jdbc.query("""
                SELECT a.security_epoch,a.state,a.email_verified,a.credential_operation_pending,b.role
                FROM account_identity a JOIN business_account b ON b.id=a.id WHERE b.organization_id=? AND a.id=?
                """,(r,n) -> new Recipient(r.getLong(1),r.getString(2),r.getBoolean(3),r.getBoolean(4),r.getString(5)),actor.organizationId(),recipient);
        if(recipients.isEmpty()) { throw failure(TransferFailure.Reason.NOT_FOUND); }
        var next=recipients.getFirst();
        if(next.pending()) { throw failure(TransferFailure.Reason.REQUEST_IN_PROGRESS); }
        if(!next.state().equals("ACTIVE") || !next.verified() || next.role().equals("OWNER")) { throw failure(TransferFailure.Reason.INVALID_STATE); }
        for(UUID pending:jdbc.queryForList("SELECT id FROM ownership_transfer WHERE organization_id=? AND state='PENDING' FOR UPDATE",UUID.class,actor.organizationId())) {
            var old=read(actor.organizationId(),pending);String state=effectiveState(old,now);
            transition(actor.accountId(),pending,state.equals("PENDING")?"INVALIDATED":state,now);
        }
        UUID id=ids.next();
        jdbc.update("""
                INSERT INTO ownership_transfer(id,organization_id,issuer_id,recipient_id,recipient_epoch,request_revision_token,state,expires_at,created_at,updated_at)
                VALUES (?,?,?,?,?,?,'PENDING',?,?,?)
                """,id,actor.organizationId(),actor.accountId(),recipient,next.epoch(),expected,Timestamp.from(now.plus(7,ChronoUnit.DAYS)),Timestamp.from(now),Timestamp.from(now));
        jdbc.update("UPDATE organization SET revision=revision+1,updated_at=? WHERE id=?",Timestamp.from(now),actor.organizationId());
        audit.changed(actor.accountId(),id,TransferAudit.Action.TRANSFER_REQUESTED);
        return new Creation(view(read(actor.organizationId(),id),now),false);
    }
    public View get(BusinessScope actor,UUID id) {
        var transfer=read(actor.organizationId(),id);visible(actor,transfer);return view(transfer,now());
    }
    public void revoke(BusinessScope actor,UUID id) {
        owner(actor);var transfer=read(actor.organizationId(),id);Instant now=now();
        String state=effectiveState(transfer,now);if(state.equals("REVOKED")) { return; }
        if(!state.equals("PENDING")) { throw failure(TransferFailure.Reason.INVALID_STATE); }
        transition(actor.accountId(),id,"REVOKED",now);
    }
    public Acceptance accept(BusinessScope actor,AuthenticatedSession principal,UUID id,String expected) {
        Instant now=now();var transfer=read(actor.organizationId(),id);
        if(!actor.accountId().equals(transfer.recipient())) { throw failure(TransferFailure.Reason.NOT_FOUND); }
        fresh(principal,now);
        // The consumed transfer is its natural action identity; current authentication/recipient scope still applies.
        if(transfer.state().equals("ACCEPTED")) { return new Acceptance(view(transfer,now),true); }
        View current=view(transfer,now);
        if(!current.revision().equals(expected)) { throw new RevisionConflict(current.revision()); }
        if(transfer.pendingCredential()) { throw failure(TransferFailure.Reason.REQUEST_IN_PROGRESS); }
        if(!current.state().equals("PENDING")) { throw failure(TransferFailure.Reason.INVALID_STATE); }
        var issuer=jdbc.queryForObject("SELECT credential_operation_pending FROM account_identity WHERE id=?",Boolean.class,transfer.issuer());
        if(Boolean.TRUE.equals(issuer)) { throw failure(TransferFailure.Reason.REQUEST_IN_PROGRESS); }
        jdbc.update("""
                UPDATE business_account SET role=CASE WHEN id=? THEN 'OWNER' ELSE 'ADMIN' END
                WHERE organization_id=? AND id IN (?,?)
                """,transfer.recipient(),actor.organizationId(),transfer.issuer(),transfer.recipient());
        jdbc.update("UPDATE organization SET owner_account_id=?,revision=revision+1,updated_at=? WHERE id=?",transfer.recipient(),Timestamp.from(now),actor.organizationId());
        jdbc.update("UPDATE account_identity SET revision=revision+1,security_epoch=security_epoch+1,updated_at=? WHERE id IN (?,?)",
                Timestamp.from(now),transfer.issuer(),transfer.recipient());
        jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id IN (?,?) AND revoked_at IS NULL",Timestamp.from(now),transfer.issuer(),transfer.recipient());
        transition(actor.accountId(),id,"ACCEPTED",now);
        notices.ownerChanged(actor.organizationId(),id,transfer.issuer(),transfer.recipient(),now);
        return new Acceptance(view(read(actor.organizationId(),id),now),false);
    }
    private void transition(UUID actor,UUID id,String state,Instant now) {
        int changed=jdbc.update("UPDATE ownership_transfer SET state=?,revision=revision+1,updated_at=? WHERE id=? AND state='PENDING'",state,Timestamp.from(now),id);
        if(changed!=1) { throw new IllegalStateException("Transfer outcome changed unexpectedly."); }
        audit.changed(actor,id,switch(state) {
            case "ACCEPTED" -> TransferAudit.Action.TRANSFER_ACCEPTED;
            case "REVOKED" -> TransferAudit.Action.TRANSFER_REVOKED;
            case "EXPIRED" -> TransferAudit.Action.TRANSFER_EXPIRED;
            default -> TransferAudit.Action.TRANSFER_INVALIDATED;
        });
    }
    private Stored read(UUID org,UUID id) {
        var rows=jdbc.query("""
                SELECT t.*,a.security_epoch AS current_epoch,a.state AS recipient_state,a.email_verified,a.credential_operation_pending,
                       o.owner_account_id FROM ownership_transfer t JOIN account_identity a ON a.id=t.recipient_id
                JOIN organization o ON o.id=t.organization_id WHERE t.organization_id=? AND t.id=?
                """,OwnershipService::map,org,id);
        if(rows.isEmpty()) { throw failure(TransferFailure.Reason.NOT_FOUND); }return rows.getFirst();
    }
    private View view(Stored s,Instant now) {
        String state=effectiveState(s,now);long revision=s.revision()+(state.equals(s.state())?0:1);
        return new View(s.id(),revisions.encode("transfer/v1",s.id(),revision),s.recipient(),state,s.expires());
    }
    private static String effectiveState(Stored s,Instant now) {
        if(!s.state().equals("PENDING")) { return s.state(); }
        if(!now.isBefore(s.expires())) { return "EXPIRED"; }
        if(!s.owner().equals(s.issuer()) || s.currentEpoch()!=s.recipientEpoch() || !s.recipientState().equals("ACTIVE") || !s.verified()) { return "INVALIDATED"; }
        return "PENDING";
    }
    private static void visible(BusinessScope actor,Stored s) {
        if(actor.role()!=BusinessRole.OWNER && !actor.accountId().equals(s.recipient())) { throw failure(TransferFailure.Reason.NOT_FOUND); }
    }
    private static void owner(BusinessScope actor) { if(actor.role()!=BusinessRole.OWNER) { throw failure(TransferFailure.Reason.FORBIDDEN); } }
    private static void fresh(AuthenticatedSession principal,Instant now) {
        if(principal.authenticatedAt().isAfter(now) || !now.isBefore(principal.authenticatedAt().plusSeconds(300))) { throw failure(TransferFailure.Reason.REAUTHENTICATION_REQUIRED); }
    }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private static TransferFailure failure(TransferFailure.Reason r) { return new TransferFailure(r); }
    private static Stored map(ResultSet r,int n) throws SQLException {
        return new Stored(r.getObject("id",UUID.class),r.getLong("revision"),r.getObject("issuer_id",UUID.class),r.getObject("recipient_id",UUID.class),
                r.getLong("recipient_epoch"),r.getString("state"),r.getTimestamp("expires_at").toInstant(),r.getLong("current_epoch"),r.getString("recipient_state"),
                r.getBoolean("email_verified"),r.getBoolean("credential_operation_pending"),r.getObject("owner_account_id",UUID.class));
    }
    private record Receipt(UUID id,UUID recipient) { }
    private record Recipient(long epoch,String state,boolean verified,boolean pending,String role) { }
    private record Stored(UUID id,long revision,UUID issuer,UUID recipient,long recipientEpoch,String state,Instant expires,
            long currentEpoch,String recipientState,boolean verified,boolean pendingCredential,UUID owner) { }
    public record View(UUID id,String revision,UUID recipientAccountId,String state,Instant expiresAt) { }
    public record Creation(View transfer,boolean replay) { }
    public record Acceptance(View transfer,boolean replay) { }
}
