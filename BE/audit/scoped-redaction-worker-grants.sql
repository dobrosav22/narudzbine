-- Separate restricted one-job tool credential, never the public HTTP role.
GRANT USAGE ON SCHEMA public TO __EXECUTOR_ROLE__;
GRANT SELECT ON backend_schema_version,privacy_redaction_worker_work TO __EXECUTOR_ROLE__;
GRANT EXECUTE ON FUNCTION acknowledge_scoped_redaction(uuid,text,text,integer,text,timestamptz) TO __EXECUTOR_ROLE__;
GRANT EXECUTE ON FUNCTION apply_scoped_redaction(uuid,uuid,uuid,timestamptz) TO __EXECUTOR_ROLE__;

GRANT EXECUTE ON FUNCTION acknowledge_identity_containment(uuid,uuid,text,timestamptz,timestamptz) TO __EXECUTOR_ROLE__;
