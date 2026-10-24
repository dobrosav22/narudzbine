-- Authenticated HTTP runtime. No private source or artifact SELECT.
GRANT SELECT ON privacy_export_metadata TO __RUNTIME_ROLE__;
GRANT INSERT(id,case_id,organization_id,country,approved_by,approved_session,approved_transport,approved_qualification,approval_audit_id,expected_case_revision,case_revision_token,approval_digest,private_reference,original_response,created_at,updated_at) ON privacy_export_job TO __RUNTIME_ROLE__;
GRANT EXECUTE ON FUNCTION owned_privacy_export(uuid,uuid,uuid,uuid,text,uuid,text,timestamptz) TO __RUNTIME_ROLE__;
GRANT EXECUTE ON FUNCTION disclose_privacy_export(uuid,uuid,uuid,uuid,text,uuid,text,timestamptz,uuid,uuid) TO __RUNTIME_ROLE__;
-- Qualification metadata/locking only; no operator enrollment or private review disclosure grants.
GRANT SELECT ON privacy_operator TO __RUNTIME_ROLE__;
GRANT UPDATE(account_id) ON privacy_operator TO __RUNTIME_ROLE__;
