package com.narudzbine.organizations.application;

import com.narudzbine.audit.api.ContactAudit;
import com.narudzbine.organizations.api.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class ContactService implements BusinessContacts {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final ContactAudit audit;
    private final com.narudzbine.audit.api.OrganizationAudit organizationAudit;
    public ContactService(JdbcTemplate jdbc, Clock clock, ContactAudit audit, com.narudzbine.audit.api.OrganizationAudit organizationAudit) {
        this.jdbc=jdbc; this.clock=clock; this.audit=audit;this.organizationAudit=organizationAudit;
    }
    @Override public BusinessContactRecord read(UUID org, UUID id) {
        var rows=jdbc.query("SELECT * FROM business_contact WHERE organization_id=? AND id=?",ContactService::map,org,id);
        if (rows.isEmpty()) { throw failure(ContactFailure.Reason.NOT_FOUND,null); }
        return rows.getFirst();
    }
    @Override public Page list(UUID org,int page,int size,String state,boolean total) {
        // One SQL statement ensures items and optional total observe the same Read Committed snapshot.
        var rows=jdbc.query("""
                WITH filtered AS MATERIALIZED (
                    SELECT * FROM business_contact WHERE organization_id=? AND (?::text IS NULL OR state=?)
                ), page AS (SELECT * FROM filtered ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?)
                SELECT p.*,t.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM filtered) t
                LEFT JOIN page p ON true ORDER BY p.created_at DESC,p.id ASC
                """,(r,n) -> new PageRow(r.getObject("id")==null?null:map(r,n),(Long)r.getObject("total")),
                org,state,state,size,Math.multiplyExact(page,size),total);
        return new Page(rows.stream().filter(r -> r.contact()!=null).map(PageRow::contact).toList(),rows.getFirst().total());
    }
    @Override public Creation create(UUID actor,UUID org,UUID id,BusinessContactRecord.Values v,byte[] digest) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM business_contact WHERE id=?)",Boolean.class,id))) {
            return replay(actor,org,id,digest);
        }
        var now=clock.instant().truncatedTo(ChronoUnit.MILLIS); var c=v.contact();
        int inserted=jdbc.update("""
                INSERT INTO business_contact(id,organization_id,label,contact_name,contact_phone,contact_email,state,created_at,updated_at)
                VALUES (?,?,?,?,?,?,'ACTIVE',?,?) ON CONFLICT (id) DO NOTHING
                """,id,org,v.label(),c.name(),c.phone(),c.email(),Timestamp.from(now),Timestamp.from(now));
        if (inserted==0) { return replay(actor,org,id,digest); }
        jdbc.update("""
                INSERT INTO contact_creation(contact_id,creator_id,organization_id,payload_hash,original_snapshot,expires_at)
                SELECT id,?,organization_id,?,to_jsonb(c),? FROM business_contact c WHERE id=? AND organization_id=?
                """,actor,digest,Timestamp.from(now.plus(7,ChronoUnit.DAYS)),id,org);
        audit.changed(actor,id,ContactAudit.Action.CONTACT_CREATED,List.of(ContactAudit.Field.label,ContactAudit.Field.contact,ContactAudit.Field.state));
        return new Creation(read(org,id),false);
    }
    private Creation replay(UUID actor,UUID org,UUID id,byte[] digest) {
        var receipts=jdbc.query("""
                SELECT creator_id,payload_hash,expires_at FROM contact_creation WHERE contact_id=? AND organization_id=? FOR SHARE
                """,(r,n) -> new Receipt(r.getObject(1,UUID.class),r.getBytes(2),r.getTimestamp(3).toInstant()),id,org);
        if (receipts.isEmpty() || !actor.equals(receipts.getFirst().actor())) { throw failure(ContactFailure.Reason.NOT_FOUND,null); }
        var receipt=receipts.getFirst();
        if (!java.security.MessageDigest.isEqual(digest,receipt.hash())) { throw failure(ContactFailure.Reason.CREATE_CONFLICT,id); }
        if (!clock.instant().isBefore(receipt.expires())) { throw failure(ContactFailure.Reason.REPLAY_EXPIRED,id); }
        var original=jdbc.queryForObject("""
                SELECT (jsonb_populate_record(NULL::business_contact,original_snapshot)).*
                FROM contact_creation WHERE contact_id=? AND organization_id=?
                """,ContactService::map,id,org);
        return new Creation(original,true);
    }
    @Override public BusinessContactRecord replace(UUID actor,UUID org,UUID id,BusinessContactRecord.Values v) {
        var current=read(org,id); var fields=new ArrayList<ContactAudit.Field>();
        if (!current.label().equals(v.label())) { fields.add(ContactAudit.Field.label); }
        if (!current.contact().equals(v.contact())) { fields.add(ContactAudit.Field.contact); }
        if (fields.isEmpty()) { return current; }
        var c=v.contact();
        jdbc.update("""
                UPDATE business_contact SET label=?,contact_name=?,contact_phone=?,contact_email=?,revision=?,updated_at=?
                WHERE id=? AND organization_id=?
                """,v.label(),c.name(),c.phone(),c.email(),Math.addExact(current.revision(),1),
                Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)),id,org);
        audit.changed(actor,id,ContactAudit.Action.CONTACT_UPDATED,fields);
        return read(org,id);
    }
    @Override public BusinessContactRecord state(UUID actor,UUID org,UUID id,boolean archived) {
        var current=read(org,id); String desired=archived?"ARCHIVED":"ACTIVE";
        if (desired.equals(current.state())) { return current; }
        var now=Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));
        if(archived && jdbc.update("UPDATE organization SET partner_contact_id=NULL,revision=revision+1,updated_at=? WHERE id=? AND partner_contact_id=?",now,org,id)==1){
            organizationAudit.settingsChanged(actor,org,List.of(com.narudzbine.audit.api.OrganizationAudit.Field.partnerContactId));
        }
        jdbc.update("UPDATE business_contact SET state=?,revision=?,updated_at=? WHERE id=? AND organization_id=?",
                desired,Math.addExact(current.revision(),1),now,id,org);
        audit.changed(actor,id,archived?ContactAudit.Action.CONTACT_ARCHIVED:ContactAudit.Action.CONTACT_RESTORED,List.of(ContactAudit.Field.state));
        return read(org,id);
    }
    @Override public void compactExpiredReceipts() {
        jdbc.update("""
                UPDATE contact_creation SET original_snapshot=NULL WHERE contact_id IN (
                    SELECT contact_id FROM contact_creation WHERE expires_at<=? AND original_snapshot IS NOT NULL
                    ORDER BY expires_at,contact_id LIMIT 1000 FOR UPDATE SKIP LOCKED)
                """,Timestamp.from(clock.instant()));
    }
    private static ContactFailure failure(ContactFailure.Reason reason,UUID id) { return new ContactFailure(reason,id,null); }
    private record Receipt(UUID actor,byte[] hash,Instant expires) { }
    private record PageRow(BusinessContactRecord contact,Long total) { }
    private static BusinessContactRecord map(ResultSet r,int n) throws SQLException {
        return new BusinessContactRecord(r.getObject("id",UUID.class),r.getLong("revision"),r.getString("label"),
                new LocationRecord.Contact(r.getString("contact_name"),r.getString("contact_phone"),r.getString("contact_email")),
                r.getString("state"),r.getTimestamp("created_at").toInstant(),r.getTimestamp("updated_at").toInstant());
    }
}
