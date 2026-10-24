-- Owner-controlled, reviewed configuration only. Supply explicit operator_id, enabled,
-- and opaque reviewed change_reference using psql variables; never customer/private reason text.
-- Real account qualification/approver evidence is external input, not established by this script.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='5s';
SELECT set_config('narudzbine.operator_change_reference',:'change_reference',true) AS applied_reference \gset
INSERT INTO privacy_operator(account_id,enabled,created_at)
VALUES(:'operator_id'::uuid,:'enabled'::boolean,date_trunc('milliseconds',clock_timestamp()))
ON CONFLICT(account_id) DO UPDATE SET enabled=EXCLUDED.enabled,revision=privacy_operator.revision+1
WHERE privacy_operator.enabled IS DISTINCT FROM EXCLUDED.enabled
RETURNING account_id,revision,enabled;
COMMIT;
