package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.*;
import com.narudzbine.shared.api.ResourceRevisions;
import com.narudzbine.shared.api.UuidGenerator;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.*;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class JdbcRetentionHolds implements RetentionHolds {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String POLICY = "PLATFORM_EVIDENCE_V1";
    private final JdbcTemplate jdbc;
    private final PrivateCaseReview operators;
    private final Clock clock;
    private final UuidGenerator ids;
    private final ObjectProvider<ResourceRevisions> revisions;

    public JdbcRetentionHolds(JdbcTemplate jdbc, PrivateCaseReview operators, Clock clock,
                              UuidGenerator ids, ObjectProvider<ResourceRevisions> revisions) {
        this.jdbc = jdbc; this.operators = operators; this.clock = clock; this.ids = ids; this.revisions = revisions;
    }

    @Override public View activate(PrivateCaseReview.Actor actor, UUID caseId, PrivateCaseReview.Target target,
                                   UUID id, Context context) {
        operators.qualify(actor.account());
        barrier();
        long qualification = current(actor);
        byte[] digest = digest(caseId.toString(), context.reason(), context.caseReference());
        var previous = find(caseId, id);
        if (previous.isPresent()) {
            Row row = previous.get();
            if (!row.creator().equals(actor.account())) throw new PrivacyFailure("NOT_FOUND");
            if (!MessageDigest.isEqual(row.creationDigest(), digest)) throw new PrivacyFailure("IDEMPOTENCY_MISMATCH");
            requireReplay(row.created(), id);
            return JSON.readValue(row.original(), View.class);
        }
        if (pendingDisposal()) throw new PrivacyFailure("HOLD_ACTIVATION_BLOCKED");
        Instant at = now();
        View result = new View(id, caseId, target.organization(), target.country(), POLICY, "ACTIVE",
                revision(id, 1), time(at), null);
        audit(id, actor.account(), id, target, "RETENTION_HOLD_ACTIVATED", context.reason(), at);
        jdbc.update("""
                INSERT INTO retention_hold(id,case_id,organization_id,country,creator_id,created_session,
                created_transport,created_qualification,created_at,creation_digest,activation_reference,original_response)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?::jsonb)
                """, id, caseId, target.organization(), target.country(), actor.account(), actor.session(),
                actor.transport(), qualification, Timestamp.from(at), digest, context.caseReference(), JSON.writeValueAsString(result));
        return result;
    }

    @Override public View read(PrivateCaseReview.Actor actor, UUID caseId, UUID id) {
        current(actor);
        Row row = find(caseId, id).orElseThrow(() -> new PrivacyFailure("NOT_FOUND"));
        audit(ids.next(), actor.account(), id, row.target(), "RETENTION_HOLD_READ", null, now());
        return view(row);
    }

    @Override public View release(PrivateCaseReview.Actor actor, UUID caseId, UUID id,
                                  String expectedRevision, Context context) {
        operators.qualify(actor.account());
        barrier();
        long qualification = current(actor);
        Row row = find(caseId, id).orElseThrow(() -> new PrivacyFailure("NOT_FOUND"));
        byte[] digest = digest(caseId.toString(), expectedRevision, context.reason(), context.caseReference());
        if (row.released() != null) {
            if (!actor.account().equals(row.releaser()) || !expectedRevision.equals(row.releaseExpected()))
                throw new PrivacyFailure("REVISION_MISMATCH");
            if (!MessageDigest.isEqual(row.releaseDigest(), digest)) throw new PrivacyFailure("IDEMPOTENCY_MISMATCH");
            requireReplay(row.released(), id);
            return JSON.readValue(row.releaseOriginal(), View.class);
        }
        if (!revisions.getObject().matches("hold/v1", id, 1, expectedRevision)) throw new PrivacyFailure("REVISION_MISMATCH");
        Instant at = now();
        UUID audit = ids.next();
        View result = new View(id, caseId, row.target().organization(), row.target().country(), POLICY, "RELEASED",
                revision(id, 2), time(row.created()), time(at));
        audit(audit, actor.account(), id, row.target(), "RETENTION_HOLD_RELEASED", context.reason(), at);
        int updated = jdbc.update("""
                UPDATE retention_hold SET state='RELEASED',revision=2,release_audit_id=?,released_by=?,
                released_session=?,released_transport=?,released_qualification=?,released_at=?,release_digest=?,
                release_expected=?,release_reference=?,release_response=?::jsonb WHERE id=? AND state='ACTIVE'
                """, audit, actor.account(), actor.session(), actor.transport(), qualification, Timestamp.from(at),
                digest, expectedRevision, context.caseReference(), JSON.writeValueAsString(result), id);
        if (updated != 1) throw new PrivacyFailure("REVISION_MISMATCH");
        return result;
    }

    private long current(PrivateCaseReview.Actor actor) {
        long qualification = operators.qualify(actor.account());
        boolean valid = !jdbc.queryForList("""
                SELECT a.id FROM account_identity a JOIN application_session s ON s.account_id=a.id
                WHERE a.id=? AND s.id=? AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified
                AND NOT a.credential_operation_pending AND s.revoked_at IS NULL AND s.transport=?
                AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation
                AND s.auth_at<=? AND ?<s.auth_at+interval '300 seconds' AND ?<s.absolute_expires_at
                AND ?<s.last_qualified_activity_at+interval '30 minutes' FOR SHARE OF a,s
                """, UUID.class, actor.account(), actor.session(), actor.transport(), Timestamp.from(now()),
                Timestamp.from(now()), Timestamp.from(now()), Timestamp.from(now())).isEmpty();
        if (!valid) throw new PrivacyFailure("NOT_FOUND");
        return qualification;
    }

    private void barrier() {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended('retention-hold/preservation/v1',0))");
    }

    private boolean pendingDisposal() {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM media_disposal_claim WHERE completed_at IS NULL)
                OR EXISTS(SELECT 1 FROM media_asset a LEFT JOIN media_upload u ON u.asset_id=a.id
                WHERE a.cleanup_claimed_at IS NOT NULL AND ((a.ready_at IS NOT NULL AND a.processed_deleted_at IS NULL)
                OR(a.ready_at IS NULL AND u.raw_deleted_at IS NULL)))
                """, Boolean.class));
    }

    private Optional<Row> find(UUID caseId, UUID id) {
        return jdbc.query("""
                SELECT id,case_id,organization_id,country,state,revision,creator_id,created_at,creation_digest,
                original_response,released_by,released_at,release_digest,release_expected,release_response
                FROM retention_hold WHERE id=? AND case_id=?
                """, (r, n) -> new Row(r.getObject("id", UUID.class), r.getObject("case_id", UUID.class),
                new PrivateCaseReview.Target(r.getObject("organization_id", UUID.class), r.getString("country")),
                r.getString("state"), r.getLong("revision"), r.getObject("creator_id", UUID.class),
                r.getTimestamp("created_at").toInstant(), r.getBytes("creation_digest"), r.getString("original_response"),
                r.getObject("released_by", UUID.class), r.getTimestamp("released_at") == null ? null : r.getTimestamp("released_at").toInstant(),
                r.getBytes("release_digest"), r.getString("release_expected"), r.getString("release_response")), id, caseId).stream().findFirst();
    }

    private View view(Row row) {
        return new View(row.id(), row.caseId(), row.target().organization(), row.target().country(), POLICY,
                row.state(), revision(row.id(), row.revision()), time(row.created()), row.released() == null ? null : time(row.released()));
    }

    private void audit(UUID audit, UUID actor, UUID id, PrivateCaseReview.Target target, String action, String reason, Instant at) {
        int inserted = jdbc.update("""
                INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,
                occurred_at,reason,changed_fields,target_organization_id,target_country)
                VALUES(?,'PLATFORM_ADMIN',?,?,'RETENTION_HOLD',?,'SUCCESS',?,?,?,ARRAY['state','policy'],?,?) ON CONFLICT(id) DO NOTHING
                """, audit, actor, action, id, requestId(), Timestamp.from(at), reason, target.organization(), target.country());
        if (inserted != 1) throw new PrivacyFailure("RESOURCE_ID_REUSED");
    }

    private void requireReplay(Instant created, UUID id) {
        if (!clock.instant().isBefore(created.plus(Duration.ofDays(7)))) throw new PrivacyFailure("REPLAY_EXPIRED", id);
    }
    private String revision(UUID id, long value) { return revisions.getObject().encode("hold/v1", id, value); }
    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private static String time(Instant at) { return new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(at); }
    private UUID requestId() {
        String value = MDC.get("requestId");
        if (value != null) try { UUID id = UUID.fromString(value); if (id.version() == 7 && id.variant() == 2) return id; }
        catch (IllegalArgumentException ignored) {}
        return ids.next();
    }
    private static byte[] digest(String... values) {
        try { return MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(values)); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("Digest unavailable"); }
    }
    private record Row(UUID id, UUID caseId, PrivateCaseReview.Target target, String state, long revision,
                       UUID creator, Instant created, byte[] creationDigest, String original, UUID releaser,
                       Instant released, byte[] releaseDigest, String releaseExpected, String releaseOriginal) {
        @Override public String toString() { return "RetentionHold[redacted]"; }
    }
}
