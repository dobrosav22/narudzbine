package com.narudzbine.identity.application;

import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.*;

/** One-way disposal of remaining aged OAuth and recovery capabilities, retaining original source identity. */
@Transactional(propagation=Propagation.MANDATORY)
public class CapabilityRetention {
    private final JdbcTemplate jdbc;private final Clock clock;
    public CapabilityRetention(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
    private Timestamp cutoff(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS).minus(Duration.ofDays(30)));}
    public int exchange(){return jdbc.update("""
        WITH cutoff AS(SELECT ?::timestamptz AS at),expired AS(
          SELECT e.challenge_id FROM external_exchange e JOIN external_challenge f ON f.id=e.challenge_id CROSS JOIN cutoff c
          WHERE e.code_hash IS NOT NULL AND e.expires_at<=c.at AND e.authenticated_at<=c.at
          AND(e.consumed_at IS NULL OR e.consumed_at<=c.at) AND f.state='COMPLETED'
          AND f.expires_at<=c.at AND f.created_at<=c.at AND f.encrypted_verifier IS NULL
          ORDER BY e.expires_at,e.challenge_id LIMIT 1000 FOR UPDATE OF e SKIP LOCKED
        ) UPDATE external_exchange e SET code_hash=NULL FROM expired x WHERE e.challenge_id=x.challenge_id
        """,cutoff());}
    public int flow(){return jdbc.update("""
        WITH cutoff AS(SELECT ?::timestamptz AS at),expired AS(
          SELECT f.id FROM external_challenge f CROSS JOIN cutoff c
          WHERE f.state_hash IS NOT NULL AND f.encrypted_verifier IS NULL AND f.state IN('OPEN','COMPLETED')
          AND f.expires_at<=c.at AND f.created_at<=c.at
          AND NOT EXISTS(SELECT 1 FROM external_exchange e WHERE e.challenge_id=f.id AND e.code_hash IS NOT NULL)
          ORDER BY f.expires_at,f.id LIMIT 1000 FOR UPDATE OF f SKIP LOCKED
        ) UPDATE external_challenge f SET state_hash=NULL,browser_binding_hash=NULL,original_token_hash=NULL,native_challenge=NULL
          FROM expired x WHERE f.id=x.id
        """,cutoff());}
    public int recovery(){return jdbc.update("""
        WITH cutoff AS(SELECT ?::timestamptz AS at),expired AS(
          SELECT r.id FROM recovery_case r CROSS JOIN cutoff c
          WHERE r.token_hash IS NOT NULL AND NOT r.acceptance_retired AND r.state IN('NOTICE_PERIOD','COMPLETED','REJECTED')
          AND r.expires_at<=c.at AND r.created_at<=c.at AND r.updated_at<=c.at
          AND NOT EXISTS(SELECT 1 FROM recovery_delivery d WHERE d.case_id=r.id AND(d.encrypted_token IS NOT NULL
            OR EXISTS(SELECT 1 FROM external_delivery_retention_blocker b WHERE b.source_kind='RECOVERY' AND b.source_id=d.id)))
          AND NOT EXISTS(SELECT 1 FROM email_change e WHERE e.id=r.email_change_id AND(e.state='RECONCILING' OR e.updated_at>c.at
            OR EXISTS(SELECT 1 FROM credential_operation o WHERE o.id=e.operation_id AND(o.state NOT IN('COMPLETED','REJECTED') OR o.updated_at>c.at))))
          ORDER BY r.expires_at,r.id LIMIT 1000 FOR UPDATE OF r SKIP LOCKED
        ) UPDATE recovery_case r SET token_hash=NULL,acceptance_retired=true FROM expired x WHERE r.id=x.id
        """,cutoff());}
}
