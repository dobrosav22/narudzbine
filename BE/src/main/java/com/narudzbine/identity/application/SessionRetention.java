package com.narudzbine.identity.application;

import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.*;

/** Removes aged authentication payload; immutable original session bindings never authenticate. */
@Transactional(propagation=Propagation.MANDATORY)
public class SessionRetention {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public SessionRetention(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
    public int cleanup(){
        Timestamp cutoff=cutoff();
        return jdbc.update("""
            WITH expired AS (
                SELECT s.id FROM application_session s JOIN account_identity a ON a.id=s.account_id
                WHERE LEAST(s.absolute_expires_at,s.revoked_at,s.last_qualified_activity_at+
                    CASE WHEN a.kind='PLATFORM_ADMIN' THEN interval '30 minutes' ELSE interval '168 hours' END)<=?
                AND NOT EXISTS(SELECT 1 FROM credential_operation o WHERE o.current_session_id=s.id
                    AND(o.state NOT IN('COMPLETED','REJECTED') OR o.updated_at>?))
                AND NOT EXISTS(SELECT 1 FROM external_challenge c WHERE c.original_session_id=s.id
                    AND(c.state='CLAIMED' OR c.expires_at>? OR c.created_at>?))
                ORDER BY LEAST(s.absolute_expires_at,s.revoked_at,s.last_qualified_activity_at+
                    CASE WHEN a.kind='PLATFORM_ADMIN' THEN interval '30 minutes' ELSE interval '168 hours' END),s.id
                LIMIT 1000 FOR UPDATE OF s SKIP LOCKED
            ) DELETE FROM application_session s USING expired e WHERE s.id=e.id
            """,cutoff,cutoff,cutoff,cutoff);
    }
    private Timestamp cutoff(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS).minus(Duration.ofDays(30)));}
}
