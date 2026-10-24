-- Read-only aggregate; replace the literal with an explicit UTC assessment instant.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
WITH cutoff AS(SELECT timestamptz '2026-10-21T12:00:00Z'-interval '720 hours' AS at),
exchange_eligible AS(SELECT e.challenge_id FROM external_exchange e JOIN external_challenge f ON f.id=e.challenge_id CROSS JOIN cutoff c
          WHERE e.code_hash IS NOT NULL AND e.expires_at<=c.at AND e.authenticated_at<=c.at
          AND(e.consumed_at IS NULL OR e.consumed_at<=c.at) AND f.state='COMPLETED'
          AND f.expires_at<=c.at AND f.created_at<=c.at AND f.encrypted_verifier IS NULL),
flow_eligible AS(SELECT f.id FROM external_challenge f CROSS JOIN cutoff c
          WHERE f.state_hash IS NOT NULL AND f.encrypted_verifier IS NULL AND f.state IN('OPEN','COMPLETED')
          AND f.expires_at<=c.at AND f.created_at<=c.at
          AND NOT EXISTS(SELECT 1 FROM external_exchange e WHERE e.challenge_id=f.id AND e.code_hash IS NOT NULL)),
recovery_eligible AS(SELECT r.id FROM recovery_case r CROSS JOIN cutoff c
          WHERE r.token_hash IS NOT NULL AND NOT r.acceptance_retired AND r.state IN('NOTICE_PERIOD','COMPLETED','REJECTED')
          AND r.expires_at<=c.at AND r.created_at<=c.at AND r.updated_at<=c.at
          AND NOT EXISTS(SELECT 1 FROM recovery_delivery d WHERE d.case_id=r.id AND(d.encrypted_token IS NOT NULL
            OR EXISTS(SELECT 1 FROM external_delivery_retention_blocker b WHERE b.source_kind='RECOVERY' AND b.source_id=d.id)))
          AND NOT EXISTS(SELECT 1 FROM email_change e WHERE e.id=r.email_change_id AND(e.state='RECONCILING' OR e.updated_at>c.at
            OR EXISTS(SELECT 1 FROM credential_operation o WHERE o.id=e.operation_id AND(o.state NOT IN('COMPLETED','REJECTED') OR o.updated_at>c.at))))),
exchange_aged AS(SELECT count(*) AS n FROM external_exchange e CROSS JOIN cutoff c WHERE e.code_hash IS NOT NULL AND e.expires_at<=c.at AND e.authenticated_at<=c.at),
flow_aged AS(SELECT count(*) AS n FROM external_challenge f CROSS JOIN cutoff c WHERE f.state_hash IS NOT NULL AND f.expires_at<=c.at AND f.created_at<=c.at),
recovery_aged AS(SELECT count(*) AS n FROM recovery_case r CROSS JOIN cutoff c WHERE r.token_hash IS NOT NULL AND NOT r.acceptance_retired AND r.expires_at<=c.at AND r.created_at<=c.at)
SELECT 'exchange' AS family,(SELECT count(*) FROM exchange_eligible) AS eligible_secrets,n-(SELECT count(*) FROM exchange_eligible) AS deferred_work FROM exchange_aged
UNION ALL SELECT 'flow',(SELECT count(*) FROM flow_eligible),n-(SELECT count(*) FROM flow_eligible) FROM flow_aged
UNION ALL SELECT 'recovery',(SELECT count(*) FROM recovery_eligible),n-(SELECT count(*) FROM recovery_eligible) FROM recovery_aged
ORDER BY family;
ROLLBACK;
