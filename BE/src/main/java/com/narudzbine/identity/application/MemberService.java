package com.narudzbine.identity.application;

import com.narudzbine.audit.api.MemberAudit;
import com.narudzbine.identity.api.BusinessScope;
import com.narudzbine.identity.api.MemberFailure;
import com.narudzbine.identity.api.RevisionConflict;
import com.narudzbine.organizations.api.BusinessRole;
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

/** Caller holds organization write guard and sorted actor/target identities through commit. */
@Transactional(propagation=Propagation.MANDATORY)
public class MemberService {
    public enum Action { ROLE, DEACTIVATE, REACTIVATE }
    private final com.narudzbine.audit.api.AdministrativeAudit administrativeAudit;
    private final JdbcTemplate jdbc;
    private final AccountRevisions revisions;
    private final MemberAudit audit;
    private final Clock clock;
    private final com.narudzbine.audit.api.TransferAudit transfers;
    public MemberService(JdbcTemplate jdbc,AccountRevisions revisions,MemberAudit audit,Clock clock,com.narudzbine.audit.api.TransferAudit transfers,com.narudzbine.audit.api.AdministrativeAudit administrativeAudit) {
        this.administrativeAudit=administrativeAudit;this.jdbc=jdbc;this.revisions=revisions;this.audit=audit;this.clock=clock;this.transfers=transfers;
    }
    public Page list(UUID org,int page,int size,String state,String role,boolean total) {
        var rows=jdbc.query("""
                WITH filtered AS MATERIALIZED (
                    SELECT a.*,b.organization_id,b.role,b.home_location_id FROM account_identity a
                    JOIN business_account b ON b.id=a.id WHERE b.organization_id=?
                    AND (?::text IS NULL OR a.state=?) AND (?::text IS NULL OR b.role=?)
                ), page AS (SELECT * FROM filtered ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?)
                SELECT p.*,t.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM filtered) t
                LEFT JOIN page p ON true ORDER BY p.created_at DESC,p.id ASC
                """,(r,n) -> new PageRow(r.getObject("id")==null?null:map(r,n),(Long)r.getObject("total")),
                org,state,state,role,role,size,Math.multiplyExact(page,size),total);
        return new Page(rows.stream().filter(r -> r.member()!=null).map(PageRow::member).toList(),rows.getFirst().total());
    }
    public Member change(BusinessScope actor,UUID target,String revision,Action action,BusinessRole requestedRole) {
        var current=read(actor.organizationId(),target);
        requirePermission(actor,current,action);
        return apply(actor.accountId(),actor.organizationId(),current,revision,action,requestedRole,null,null);
    }
    /** Current named platform proof and sorted organization/account guards are required; never a fake business role. */
    public Member changeAdministrative(UUID actor,UUID org,UUID target,String revision,Action action,String reason){
        if(action==Action.ROLE||reason==null||reason.isBlank())throw new IllegalArgumentException("Invalid administrative staff command");
        var organization=jdbc.queryForMap("SELECT state,country FROM organization WHERE id=?",org);
        if(organization.get("state").equals("CLOSED"))throw failure(MemberFailure.Reason.INVALID_STATE);
        var current=read(org,target);if(current.role()!=BusinessRole.STAFF)throw failure(MemberFailure.Reason.FORBIDDEN);
        return apply(actor,org,current,revision,action,null,(String)organization.get("country"),reason);
    }
    private Member apply(UUID actorId,UUID org,Member current,String revision,Action action,BusinessRole requestedRole,String country,String administrativeReason){
        UUID target=current.id();
        if (!revisions.matches(target,current.revision(),revision)) {
            throw new RevisionConflict(revisions.encode(target,current.revision()));
        }
        if (current.pendingCredentialOperation()) { throw failure(MemberFailure.Reason.REQUEST_IN_PROGRESS); }
        if (current.role()==BusinessRole.OWNER || current.state().equals("PENDING")
                || (action==Action.REACTIVATE && !current.emailVerified())) { throw failure(MemberFailure.Reason.INVALID_STATE); }
        if (action==Action.ROLE && (!current.state().equals("ACTIVE") || requestedRole==null || requestedRole==BusinessRole.OWNER)) {
            throw failure(MemberFailure.Reason.INVALID_STATE);
        }
        BusinessRole role=action==Action.ROLE?requestedRole:action==Action.REACTIVATE?BusinessRole.STAFF:current.role();
        String state=action==Action.DEACTIVATE?"DEACTIVATED":action==Action.REACTIVATE?"ACTIVE":current.state();
        // Reactivating an already-active member is a no-op, never an implicit demotion.
        if (action==Action.REACTIVATE && current.state().equals("ACTIVE")) { return current; }
        if (role==current.role() && state.equals(current.state())) { return current; }
        var now=Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));
        jdbc.update("UPDATE business_account SET role=? WHERE id=? AND organization_id=?",role.name(),target,org);
        jdbc.update("UPDATE account_identity SET state=?,revision=revision+1,security_epoch=security_epoch+1,updated_at=? WHERE id=?",
                state,now,target);
        jdbc.update("UPDATE application_session SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL",now,target);
        var retired=jdbc.query("""
                UPDATE ownership_transfer SET state=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'INVALIDATED' END,
                    revision=revision+1,updated_at=?
                WHERE organization_id=? AND recipient_id=? AND state='PENDING' RETURNING id,state
                """,(r,n) -> new RetiredTransfer(r.getObject(1,UUID.class),r.getString(2)),now,now,org,target);
        for(var transfer:retired) {
            if(administrativeReason!=null){administrativeAudit.transfer(actorId,org,country,transfer.id(),transfer.state().equals("EXPIRED"),administrativeReason);}
            else{transfers.changed(actorId,transfer.id(),transfer.state().equals("EXPIRED")?
                    com.narudzbine.audit.api.TransferAudit.Action.TRANSFER_EXPIRED:com.narudzbine.audit.api.TransferAudit.Action.TRANSFER_INVALIDATED);}
        }
        var fields=new java.util.ArrayList<MemberAudit.Field>();
        if (role!=current.role()) { fields.add(MemberAudit.Field.role); }
        if (!state.equals(current.state())) { fields.add(MemberAudit.Field.state); }
        fields.add(MemberAudit.Field.securityEpoch);fields.add(MemberAudit.Field.sessions);
        if(administrativeReason!=null){administrativeAudit.staff(actorId,org,country,target,action==Action.REACTIVATE,fields.stream().map(Enum::name).toList(),administrativeReason);}
        else{audit.changed(actorId,target,switch(action) {
            case ROLE -> MemberAudit.Action.MEMBER_ROLE_CHANGED;
            case DEACTIVATE -> MemberAudit.Action.MEMBER_DEACTIVATED;
            case REACTIVATE -> MemberAudit.Action.MEMBER_REACTIVATED;
        },fields);}
        return read(org,target);
    }
    private static void requirePermission(BusinessScope actor,Member member,Action action) {
        boolean allowed=switch(action) {
            case ROLE -> actor.role()==BusinessRole.OWNER;
            case DEACTIVATE -> actor.role()==BusinessRole.OWNER
                    || (actor.role()==BusinessRole.ADMIN && member.role()==BusinessRole.STAFF)
                    || (actor.role()==BusinessRole.STAFF && actor.accountId().equals(member.id()));
            case REACTIVATE -> actor.role()==BusinessRole.OWNER
                    || (actor.role()==BusinessRole.ADMIN && member.role()==BusinessRole.STAFF);
        };
        if (!allowed) { throw failure(MemberFailure.Reason.FORBIDDEN); }
    }
    private Member read(UUID org,UUID id) {
        var rows=jdbc.query("""
                SELECT a.*,b.organization_id,b.role,b.home_location_id FROM account_identity a
                JOIN business_account b ON b.id=a.id WHERE b.organization_id=? AND a.id=?
                """,MemberService::map,org,id);
        if (rows.isEmpty()) { throw failure(MemberFailure.Reason.NOT_FOUND); }
        return rows.getFirst();
    }
    private static Member map(ResultSet r,int n) throws SQLException {
        return new Member(r.getObject("id",UUID.class),r.getLong("revision"),r.getObject("organization_id",UUID.class),
                r.getString("email"),r.getString("display_name"),BusinessRole.valueOf(r.getString("role")),r.getString("state"),
                r.getString("language_override"),r.getObject("home_location_id",UUID.class),r.getTimestamp("created_at").toInstant(),
                r.getTimestamp("updated_at").toInstant(),r.getBoolean("credential_operation_pending"),r.getBoolean("email_verified"));
    }
    private static MemberFailure failure(MemberFailure.Reason reason) { return new MemberFailure(reason); }
    public record Member(UUID id,long revision,UUID organizationId,String email,String displayName,BusinessRole role,
            String state,String languageOverride,UUID homeLocationId,Instant createdAt,Instant updatedAt,boolean pendingCredentialOperation,boolean emailVerified) { }
    public record Page(List<Member> items,Long total) { }
    private record PageRow(Member member,Long total) { }
    private record RetiredTransfer(UUID id,String state) { }
}
