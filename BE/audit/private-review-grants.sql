-- Validated runtime role; never grant private source SELECT or qualification management.
GRANT SELECT ON privacy_operator TO __RUNTIME_ROLE__;
GRANT UPDATE(account_id) ON privacy_operator TO __RUNTIME_ROLE__;
-- Locking privilege only: the qualification trigger rejects identity/no-op updates.
GRANT INSERT(id,case_id,organization_id,country,actor_id,session_id,transport,qualification_revision,security_epoch,credential_generation,session_token_hash,nonce_hash,reason,case_reference,created_at,expires_at) ON privacy_review_access TO __RUNTIME_ROLE__;
GRANT SELECT(id,expires_at,nonce_hash) ON privacy_review_access TO __RUNTIME_ROLE__;
GRANT UPDATE(nonce_hash,session_token_hash) ON privacy_review_access TO __RUNTIME_ROLE__;
GRANT INSERT ON privacy_review_read TO __RUNTIME_ROLE__;
GRANT EXECUTE ON FUNCTION read_privacy_review(uuid,bytea,uuid,uuid,text,timestamptz) TO __RUNTIME_ROLE__;
-- Existing auth/metadata/audit INSERT privileges remain required. No access/read DELETE or raw source read.
