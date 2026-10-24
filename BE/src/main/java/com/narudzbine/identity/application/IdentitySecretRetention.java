package com.narudzbine.identity.application;

import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.*;

/** One-way retirement of redundant delivery secrets; original proofs and reconciliation evidence remain. */
@Transactional(propagation=Propagation.MANDATORY)
public class IdentitySecretRetention {
    private final JdbcTemplate jdbc;private final Clock clock;
    public IdentitySecretRetention(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
    private Timestamp cutoff(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS).minus(Duration.ofDays(30)));}
    public int reset(){return jdbc.update("WITH cutoff AS(SELECT ?::timestamptz AS at),expired AS(SELECT d.proof_id FROM password_reset_delivery d JOIN password_reset_proof p ON p.id=d.proof_id CROSS JOIN cutoff c WHERE d.encrypted_token IS NOT NULL AND d.created_at<=c.at AND p.expires_at<=c.at AND NOT EXISTS(SELECT 1 FROM credential_operation o WHERE o.id=p.operation_id AND o.state NOT IN('COMPLETED','REJECTED')) AND NOT EXISTS(SELECT 1 FROM external_delivery_retention_blocker b WHERE b.source_kind='RESET' AND b.source_id=d.proof_id) ORDER BY d.created_at,d.proof_id LIMIT 1000 FOR UPDATE OF d SKIP LOCKED) UPDATE password_reset_delivery d SET encrypted_token=NULL FROM expired x WHERE d.proof_id=x.proof_id",cutoff());}
    public int email(){return jdbc.update("WITH cutoff AS(SELECT ?::timestamptz AS at),expired AS(SELECT d.proof_id FROM email_change_delivery d JOIN email_change_proof p ON p.id=d.proof_id JOIN email_change e ON e.id=p.change_id CROSS JOIN cutoff c WHERE d.encrypted_token IS NOT NULL AND d.created_at<=c.at AND e.expires_at<=c.at AND e.state<>'RECONCILING' AND NOT EXISTS(SELECT 1 FROM credential_operation o WHERE o.id=e.operation_id AND o.state NOT IN('COMPLETED','REJECTED')) AND NOT EXISTS(SELECT 1 FROM external_delivery_retention_blocker b WHERE b.source_kind='EMAIL_PROOF' AND b.source_id=d.proof_id) ORDER BY d.created_at,d.proof_id LIMIT 1000 FOR UPDATE OF d SKIP LOCKED) UPDATE email_change_delivery d SET encrypted_token=NULL FROM expired x WHERE d.proof_id=x.proof_id",cutoff());}
    public int setup(){return jdbc.update("WITH cutoff AS(SELECT ?::timestamptz AS at),expired AS(SELECT d.id FROM setup_delivery d JOIN setup_invitation i ON i.id=d.invitation_id LEFT JOIN setup_email_proof p ON p.id=d.proof_id CROSS JOIN cutoff c WHERE d.encrypted_token IS NOT NULL AND d.created_at<=c.at AND ((d.generation=i.generation AND i.expires_at<=c.at AND (d.proof_id IS NULL OR p.expires_at<=c.at)) OR(d.generation<i.generation AND d.created_at<=c.at-interval '168 hours')) AND NOT EXISTS(SELECT 1 FROM setup_intent t WHERE t.invitation_id=d.invitation_id AND t.state NOT IN('REJECTED','COMPLETED')) AND NOT EXISTS(SELECT 1 FROM external_delivery_retention_blocker b WHERE b.source_kind='SETUP' AND b.source_id=d.id) ORDER BY d.created_at,d.id LIMIT 1000 FOR UPDATE OF d SKIP LOCKED) UPDATE setup_delivery d SET encrypted_token=NULL FROM expired x WHERE d.id=x.id",cutoff());}
    public int recovery(){return jdbc.update("WITH cutoff AS(SELECT ?::timestamptz AS at),expired AS(SELECT d.id FROM recovery_delivery d JOIN recovery_case r ON r.id=d.case_id CROSS JOIN cutoff c WHERE d.encrypted_token IS NOT NULL AND d.created_at<=c.at AND d.kind='ACCEPTANCE' AND r.expires_at<=c.at AND r.state<>'RECONCILING' AND NOT EXISTS(SELECT 1 FROM external_delivery_retention_blocker b WHERE b.source_kind='RECOVERY' AND b.source_id=d.id) ORDER BY d.created_at,d.id LIMIT 1000 FOR UPDATE OF d SKIP LOCKED) UPDATE recovery_delivery d SET encrypted_token=NULL FROM expired x WHERE d.id=x.id",cutoff());}
}
