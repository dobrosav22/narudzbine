-- Schema69, reviewed runtime identifier. Existing auth/private-review/metadata/audit grants apply.
GRANT SELECT(id,case_id,organization_id,country,policy,state,revision,creator_id,created_at,creation_digest,original_response,released_by,released_at,release_digest,release_expected,release_response) ON retention_hold TO __RUNTIME_ROLE__;
GRANT INSERT(id,case_id,organization_id,country,creator_id,created_session,created_transport,created_qualification,created_at,creation_digest,activation_reference,original_response) ON retention_hold TO __RUNTIME_ROLE__;
GRANT UPDATE(state,revision,release_audit_id,released_by,released_session,released_transport,released_qualification,released_at,release_digest,release_expected,release_reference,release_response) ON retention_hold TO __RUNTIME_ROLE__;
-- No private reference SELECT, DELETE/TRUNCATE/TRIGGER, definer trigger EXECUTE or claim table DML.

-- Read only the disposal preflight needed before an activation can commit.
GRANT SELECT(completed_at) ON media_disposal_claim TO __RUNTIME_ROLE__;
GRANT SELECT(id,ready_at,processed_deleted_at,cleanup_claimed_at) ON media_asset TO __RUNTIME_ROLE__;
GRANT SELECT(asset_id,raw_deleted_at) ON media_upload TO __RUNTIME_ROLE__;
