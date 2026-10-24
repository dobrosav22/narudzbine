package com.narudzbine.organizations.application;

import com.narudzbine.audit.api.LocationAudit;
import com.narudzbine.organizations.api.*;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class LocationService implements Locations {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final LocationAudit audit;
    public LocationService(JdbcTemplate jdbc, Clock clock, LocationAudit audit) {
        this.jdbc = jdbc; this.clock = clock; this.audit = audit;
    }
    @Override public java.util.Optional<LocationRecord> find(UUID org,UUID id){return jdbc.query("SELECT * FROM organization_location WHERE organization_id=? AND id=?",LocationService::map,org,id).stream().findFirst();}
    @Override public LocationRecord read(UUID org,UUID id){return find(org,id).orElseThrow(()->failure(LocationFailure.Reason.NOT_FOUND,null));}
    @Override public Page list(UUID org, int page, int size, String state, boolean total) {
        var items = jdbc.query("""
                SELECT * FROM organization_location WHERE organization_id=? AND (?::text IS NULL OR state=?)
                ORDER BY created_at DESC, id ASC LIMIT ? OFFSET ?
                """, LocationService::map, org, state, state, size, Math.multiplyExact(page, size));
        Long count = total ? jdbc.queryForObject("SELECT count(*) FROM organization_location WHERE organization_id=? AND (?::text IS NULL OR state=?)",
                Long.class, org, state, state) : null;
        return new Page(List.copyOf(items), count);
    }
    @Override public Creation create(UUID actor, UUID org, UUID id, LocationRecord.Values v, byte[] digest) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM organization_location WHERE id=?)",Boolean.class,id))) {
            return replay(actor,org,id,digest);
        }
        requireNameAvailable(org,id,v.name());
        var a = v.address(); var c = v.contact(); var now = Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));
        int inserted = jdbc.update("""
                INSERT INTO organization_location(id,organization_id,country,organization_type,name,normalized_name,address_line1,address_line2,
                    address_city,address_postal_code,address_latitude,address_longitude,contact_name,contact_phone,contact_email,
                    instructions,state,created_at,updated_at)
                SELECT ?,o.id,o.country,o.type,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,? FROM organization o WHERE o.id=?
                ON CONFLICT (id) DO NOTHING
                """, id, v.name(), normalizedName(v.name()), a.line1(), a.line2(), a.city(), a.postalCode(), a.latitude(), a.longitude(),
                c == null ? null : c.name(), c == null ? null : c.phone(), c == null ? null : c.email(), v.instructions(), now, now, org);
        if (inserted == 0) { return replay(actor,org,id,digest); }
        jdbc.update("""
                INSERT INTO location_creation(location_id,creator_id,organization_id,payload_hash,original_snapshot,expires_at)
                SELECT id,?,organization_id,?,to_jsonb(l),? FROM organization_location l WHERE id=? AND organization_id=?
                """, actor, digest, Timestamp.from(now.toInstant().plus(7, ChronoUnit.DAYS)), id, org);
        audit.changed(actor, id, LocationAudit.Action.LOCATION_CREATED,
                List.of(LocationAudit.Field.name, LocationAudit.Field.address, LocationAudit.Field.contact, LocationAudit.Field.instructions, LocationAudit.Field.state));
        return new Creation(read(org, id), false);
    }
    private Creation replay(UUID actor,UUID org,UUID id,byte[] digest) {
            var receipts = jdbc.query("""
                    SELECT creator_id,payload_hash,expires_at FROM location_creation WHERE location_id=? AND organization_id=? FOR SHARE
                    """, (r, n) -> new Receipt(r.getObject(1, UUID.class), r.getBytes(2), r.getTimestamp(3).toInstant()), id, org);
            if (receipts.isEmpty() || !actor.equals(receipts.getFirst().actor())) { throw failure(LocationFailure.Reason.NOT_FOUND, null); }
            var receipt = receipts.getFirst();
            if (!java.security.MessageDigest.isEqual(digest, receipt.hash())) { throw failure(LocationFailure.Reason.CREATE_CONFLICT, id); }
            if (!clock.instant().isBefore(receipt.expires())) { throw failure(LocationFailure.Reason.REPLAY_EXPIRED, id); }
            var original = jdbc.queryForObject("""
                    SELECT (jsonb_populate_record(NULL::organization_location,original_snapshot)).*
                    FROM location_creation WHERE location_id=? AND organization_id=?
                    """, LocationService::map, id, org);
            return new Creation(original, true);
    }
    private void requireNameAvailable(UUID org,UUID id,String name) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM organization_location WHERE organization_id=? AND normalized_name=? AND id<>?)",
                Boolean.class,org,normalizedName(name),id))) { throw failure(LocationFailure.Reason.DUPLICATE_NAME,null); }
    }
    private static String normalizedName(String name) { return java.text.Normalizer.normalize(name.strip(),java.text.Normalizer.Form.NFC).toLowerCase(java.util.Locale.ROOT); }
    @Override public LocationRecord replace(UUID actor, UUID org, UUID id, LocationRecord.Values v) {
        var current = read(org, id);
        var fields = new ArrayList<LocationAudit.Field>();
        if (!current.name().equals(v.name())) { fields.add(LocationAudit.Field.name); }
        if (!current.address().equals(v.address())) { fields.add(LocationAudit.Field.address); }
        if (!Objects.equals(current.contact(), v.contact())) { fields.add(LocationAudit.Field.contact); }
        if (!Objects.equals(current.instructions(), v.instructions())) { fields.add(LocationAudit.Field.instructions); }
        if (fields.isEmpty()) { return current; }
        requireNameAvailable(org,id,v.name());
        var a = v.address(); var c = v.contact();
        jdbc.update("""
                UPDATE organization_location SET name=?,normalized_name=?,address_line1=?,address_line2=?,address_city=?,address_postal_code=?,
                    address_latitude=?,address_longitude=?,contact_name=?,contact_phone=?,contact_email=?,instructions=?,revision=?,updated_at=?
                WHERE id=? AND organization_id=?
                """, v.name(), normalizedName(v.name()), a.line1(), a.line2(), a.city(), a.postalCode(), a.latitude(), a.longitude(),
                c == null ? null : c.name(), c == null ? null : c.phone(), c == null ? null : c.email(), v.instructions(),
                Math.addExact(current.revision(), 1), Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)), id, org);
        audit.changed(actor, id, LocationAudit.Action.LOCATION_UPDATED, fields);
        return read(org, id);
    }
    @Override public LocationRecord state(UUID actor, UUID org, UUID id, boolean archived) {
        var current = read(org, id); String desired = archived ? "ARCHIVED" : "ACTIVE";
        if (desired.equals(current.state())) { return current; }
        var now = Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));
        var fields = new ArrayList<LocationAudit.Field>(); fields.add(LocationAudit.Field.state);
        if (archived) {
            // Organization guard excludes concurrent home selection, role changes and location writes.
            var accounts = jdbc.queryForList("SELECT id FROM business_account WHERE organization_id=? AND home_location_id=? ORDER BY id FOR UPDATE", UUID.class, org, id);
            for (UUID account : accounts) {
                jdbc.update("UPDATE account_identity SET revision=revision+1,updated_at=? WHERE id=?", now, account);
            }
            int cleared = jdbc.update("UPDATE business_account SET home_location_id=NULL WHERE organization_id=? AND home_location_id=?", org, id);
            if (cleared > 0) { fields.add(LocationAudit.Field.homeLocationId); }
        }
        jdbc.update("UPDATE organization_location SET state=?,revision=?,updated_at=? WHERE id=? AND organization_id=?",
                desired, Math.addExact(current.revision(), 1), now, id, org);
        audit.changed(actor, id, archived ? LocationAudit.Action.LOCATION_ARCHIVED : LocationAudit.Action.LOCATION_RESTORED, fields);
        return read(org, id);
    }
    @Override public void compactExpiredReceipts() {
        jdbc.update("""
                UPDATE location_creation SET original_snapshot=NULL WHERE location_id IN (
                    SELECT location_id FROM location_creation WHERE expires_at<=? AND original_snapshot IS NOT NULL
                    ORDER BY expires_at,location_id LIMIT 1000 FOR UPDATE SKIP LOCKED)
                """, Timestamp.from(clock.instant()));
    }
    private static LocationFailure failure(LocationFailure.Reason reason, UUID id) { return new LocationFailure(reason, id, null); }
    private record Receipt(UUID actor, byte[] hash, java.time.Instant expires) { }
    private static LocationRecord map(ResultSet r, int n) throws SQLException {
        return new LocationRecord(r.getObject("id", UUID.class), r.getLong("revision"), r.getString("name"),
                new OrganizationRecord.Address(r.getString("address_line1"), r.getString("address_line2"), r.getString("address_city"),
                    r.getString("address_postal_code"), Country.valueOf(r.getString("country")), decimal(r.getBigDecimal("address_latitude")), decimal(r.getBigDecimal("address_longitude"))),
                r.getString("contact_name") == null ? null : new LocationRecord.Contact(r.getString("contact_name"), r.getString("contact_phone"), r.getString("contact_email")),
                r.getString("instructions"), r.getString("state"), r.getTimestamp("created_at").toInstant(), r.getTimestamp("updated_at").toInstant());
    }
    private static BigDecimal decimal(BigDecimal v) { return v == null ? null : v.stripTrailingZeros(); }
}
