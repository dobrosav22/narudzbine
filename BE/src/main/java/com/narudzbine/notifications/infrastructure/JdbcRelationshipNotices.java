package com.narudzbine.notifications.infrastructure;
import com.narudzbine.notifications.api.RelationshipNotices;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcRelationshipNotices implements RelationshipNotices {
    private final JdbcTemplate jdbc;private final UuidGenerator ids;
    public JdbcRelationshipNotices(JdbcTemplate jdbc,UuidGenerator ids){this.jdbc=jdbc;this.ids=ids;}
    public void disconnected(UUID relationship,long revision,UUID vendor,UUID buyer,UUID actor,Instant now){
        var recipients=jdbc.queryForList("""
            SELECT a.id,b.organization_id,COALESCE(a.language_override,o.default_language) AS locale,
             other.display_name AS source_name FROM account_identity a
            JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id
            JOIN organization other ON other.id=CASE WHEN o.id=? THEN ? ELSE ? END
            WHERE o.id IN (?,?) AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified
             AND b.role IN ('OWNER','ADMIN') AND a.id<>? ORDER BY a.id
            """,vendor,buyer,vendor,vendor,buyer,actor);
        for(var recipient:recipients){
            UUID notice=ids.next();jdbc.update("""
                INSERT INTO ordinary_notice(id,event_key,relationship_id,relationship_revision,organization_id,
                 recipient_account_id,locale,source_name,created_at) VALUES (?,'RELATIONSHIP_DISCONNECTED',?,?,?,?,?,?,?)
                """,notice,relationship,revision,recipient.get("organization_id"),recipient.get("id"),recipient.get("locale"),recipient.get("source_name"),Timestamp.from(now));
            for(String channel:List.of("IN_APP","EMAIL","PUSH")){
                jdbc.update("INSERT INTO ordinary_delivery(id,notice_id,channel,state,created_at,expires_at) VALUES (?,?,?,'QUEUED',?,?)",ids.next(),notice,channel,Timestamp.from(now),Timestamp.from(now.plusSeconds(86400)));
            }
        }
    }
}
