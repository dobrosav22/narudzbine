-- Dedicated archive worker only. No raw source audit/account/credential SELECT or commercial writes.
GRANT USAGE ON SCHEMA public TO __WORKER_ROLE__;
GRANT SELECT ON backend_schema_version,audit_archive_work,audit_archive_source TO __WORKER_ROLE__;
GRANT EXECUTE ON FUNCTION claim_audit_archive(uuid,uuid,timestamptz) TO __WORKER_ROLE__;
GRANT EXECUTE ON FUNCTION acknowledge_audit_archive(uuid,text,text,integer,text,timestamptz) TO __WORKER_ROLE__;

GRANT EXECUTE ON FUNCTION archive_policy_matches(uuid,text) TO __WORKER_ROLE__;
