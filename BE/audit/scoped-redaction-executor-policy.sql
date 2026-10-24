-- Owner-controlled reviewed configuration. Supply executor_role, environment_code, enabled,
-- configuration_reference. No secret, account/customer name or actual legal conclusion belongs here.
\set ON_ERROR_STOP on
\if :{?identity_endpoint}
\else
\set identity_endpoint ''
\endif
\if :{?identity_tenant_id}
\else
\set identity_tenant_id ''
\endif
\if :{?identity_conformance_reference}
\else
\set identity_conformance_reference ''
\endif
\if :{?identity_absence_allowed}
\else
\set identity_absence_allowed false
\endif
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='5s';
WITH observed AS(SELECT date_trunc('milliseconds',clock_timestamp()) AS at_time)
INSERT INTO privacy_redaction_executor(id,revision,role_oid,environment_code,enabled,configuration_reference,created_at,updated_at,identity_endpoint,identity_tenant_id,identity_conformance_reference,identity_absence_allowed)
SELECT 1,1,:'executor_role'::regrole::oid,:'environment_code',:'enabled'::boolean,:'configuration_reference',at_time,at_time,nullif(:'identity_endpoint',''),nullif(:'identity_tenant_id','')::uuid,nullif(:'identity_conformance_reference',''),:'identity_absence_allowed'::boolean FROM observed
ON CONFLICT(id) DO UPDATE SET revision=privacy_redaction_executor.revision+1,role_oid=EXCLUDED.role_oid,environment_code=EXCLUDED.environment_code,enabled=EXCLUDED.enabled,configuration_reference=EXCLUDED.configuration_reference,identity_endpoint=EXCLUDED.identity_endpoint,identity_tenant_id=EXCLUDED.identity_tenant_id,identity_conformance_reference=EXCLUDED.identity_conformance_reference,identity_absence_allowed=EXCLUDED.identity_absence_allowed,updated_at=greatest(EXCLUDED.updated_at,privacy_redaction_executor.updated_at)
WHERE(privacy_redaction_executor.role_oid,privacy_redaction_executor.environment_code,privacy_redaction_executor.enabled,privacy_redaction_executor.configuration_reference,privacy_redaction_executor.identity_endpoint,privacy_redaction_executor.identity_tenant_id,privacy_redaction_executor.identity_conformance_reference,privacy_redaction_executor.identity_absence_allowed) IS DISTINCT FROM(EXCLUDED.role_oid,EXCLUDED.environment_code,EXCLUDED.enabled,EXCLUDED.configuration_reference,EXCLUDED.identity_endpoint,EXCLUDED.identity_tenant_id,EXCLUDED.identity_conformance_reference,EXCLUDED.identity_absence_allowed)
RETURNING revision,environment_code,enabled,configuration_reference;
COMMIT;
