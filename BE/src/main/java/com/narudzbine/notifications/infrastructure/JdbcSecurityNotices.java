package com.narudzbine.notifications.infrastructure;

import com.narudzbine.notifications.api.SecurityNotices;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcSecurityNotices implements SecurityNotices {
    private final JdbcTemplate jdbc;
    private final UuidGenerator ids;
    public JdbcSecurityNotices(JdbcTemplate jdbc,UuidGenerator ids) { this.jdbc=jdbc;this.ids=ids; }
    @Override public void recovered(UUID org,UUID recovery,UUID recipient,String oldEmail,String newEmail,boolean ownerChanged,Instant now) {
        for(String event:ownerChanged?java.util.List.of("OWNER_CHANGED","RECOVERY_COMPLETED"):java.util.List.of("RECOVERY_COMPLETED")) {
            UUID notice=ids.next();
            jdbc.update("""
                    INSERT INTO security_notice(id,event_key,resource_id,recovery_case_id,organization_id,recipient_account_id,locale,created_at)
                    SELECT ?,?,?,?,b.organization_id,a.id,COALESCE(a.language_override,o.default_language),?
                    FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id
                    WHERE a.id=? AND b.organization_id=?
                    """,notice,event,recovery,recovery,Timestamp.from(now),recipient,org);
            jdbc.update("INSERT INTO outbox_event(id,notice_id,channel,state,created_at,destination_key,destination_email) VALUES (?,?,'EMAIL','QUEUED',?,'OLD',?)",ids.next(),notice,Timestamp.from(now),oldEmail);
            if(newEmail!=null) {jdbc.update("INSERT INTO outbox_event(id,notice_id,channel,state,created_at,destination_key,destination_email) VALUES (?,?,'EMAIL','QUEUED',?,'NEW',?)",ids.next(),notice,Timestamp.from(now),newEmail);}
        }
    }
    @Override public void ownerChanged(UUID org,UUID transfer,UUID former,UUID next,Instant now) {
        for(UUID recipient:java.util.List.of(former,next)) {
            UUID notice=ids.next();
            int inserted=jdbc.update("""
                    INSERT INTO security_notice(id,event_key,resource_id,ownership_transfer_id,organization_id,recipient_account_id,locale,created_at)
                    SELECT ?,'OWNER_CHANGED',?,?,b.organization_id,a.id,COALESCE(a.language_override,o.default_language),?
                    FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id
                    WHERE a.id=? AND b.organization_id=?
                    """,notice,transfer,transfer,Timestamp.from(now),recipient,org);
            if(inserted!=1) { throw new IllegalStateException("Security notice recipient unavailable."); }
            jdbc.update("INSERT INTO outbox_event(id,notice_id,channel,state,created_at) VALUES (?,?,'EMAIL','QUEUED',?)",
                    ids.next(),notice,Timestamp.from(now));
        }
    }
    @Override public void emailChangeStarted(UUID account,UUID change,String oldEmail,Instant now) {
        emailNotice(account,change,null,"EMAIL_CHANGE_STARTED",oldEmail,null,now);
    }
    @Override public void emailChanged(UUID account,UUID change,UUID operation,String oldEmail,String newEmail,Instant now) {
        emailNotice(account,change,operation,"EMAIL_CHANGED",oldEmail,newEmail,now);
    }
    private void emailNotice(UUID account,UUID change,UUID operation,String event,String oldEmail,String newEmail,Instant now) {
        UUID notice=ids.next();
        int inserted=jdbc.update("""
                INSERT INTO security_notice(id,event_key,resource_id,email_change_id,credential_operation_id,organization_id,recipient_account_id,locale,created_at)
                SELECT ?,?,?,?,?,b.organization_id,a.id,COALESCE(a.language_override,o.default_language,'en'),?
                FROM account_identity a LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id
                WHERE a.id=?
                """,notice,event,change,change,operation,Timestamp.from(now),account);
        if(inserted!=1) { throw new IllegalStateException("Security notice recipient unavailable."); }
        jdbc.update("INSERT INTO outbox_event(id,notice_id,channel,state,created_at,destination_key,destination_email) VALUES (?,?,'EMAIL','QUEUED',?,'OLD',?)",
                ids.next(),notice,Timestamp.from(now),oldEmail);
        if(newEmail!=null) { jdbc.update("INSERT INTO outbox_event(id,notice_id,channel,state,created_at,destination_key,destination_email) VALUES (?,?,'EMAIL','QUEUED',?,'NEW',?)",
                ids.next(),notice,Timestamp.from(now),newEmail); }
    }
    @Override public void passwordChanged(UUID account, UUID operation, Instant now) {
        UUID notice=ids.next();
        int inserted=jdbc.update("""
                INSERT INTO security_notice(id,event_key,resource_id,credential_operation_id,organization_id,recipient_account_id,locale,created_at)
                SELECT ?,'PASSWORD_CHANGED',?,?,b.organization_id,a.id,COALESCE(a.language_override,o.default_language,'en'),?
                FROM account_identity a LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id
                WHERE a.id=? ON CONFLICT(event_key,resource_id,recipient_account_id) DO NOTHING
                """,notice,operation,operation,Timestamp.from(now),account);
        if(inserted==1) {
            jdbc.update("INSERT INTO outbox_event(id,notice_id,channel,state,created_at) VALUES (?,?,'EMAIL','QUEUED',?)",
                    ids.next(),notice,Timestamp.from(now));
        } else if(jdbc.queryForObject("SELECT count(*) FROM security_notice WHERE event_key='PASSWORD_CHANGED' AND resource_id=? AND recipient_account_id=?",
                Integer.class,operation,account)!=1) { throw new IllegalStateException("Security notice recipient unavailable."); }
    }
}
