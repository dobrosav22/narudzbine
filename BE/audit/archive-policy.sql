-- Reviewed owner/migration-role configuration only. No credentials, private case text or fake human actor.
-- psql -v policy_id=<UUIDv7> -v worker_role=<existing restricted role> -v enabled=true|false
--      -v configuration_reference=<opaque reviewed reference> -f audit/archive-policy.sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='5s';
WITH observed AS(SELECT date_trunc('milliseconds',clock_timestamp()) AS at_time)
INSERT INTO audit_archive_policy(id,worker_role,enabled,configuration_reference,created_at,updated_at)
SELECT :'policy_id'::uuid,:'worker_role'::regrole::oid,:'enabled'::boolean,:'configuration_reference',at_time,at_time FROM observed
ON CONFLICT(id) DO UPDATE SET worker_role=EXCLUDED.worker_role,enabled=EXCLUDED.enabled,
 configuration_reference=EXCLUDED.configuration_reference,revision=audit_archive_policy.revision+1,
 updated_at=greatest(EXCLUDED.updated_at,audit_archive_policy.updated_at)
WHERE(audit_archive_policy.worker_role,audit_archive_policy.enabled,audit_archive_policy.configuration_reference)
 IS DISTINCT FROM(EXCLUDED.worker_role,EXCLUDED.enabled,EXCLUDED.configuration_reference)
RETURNING id,revision,enabled,configuration_reference;
COMMIT;
