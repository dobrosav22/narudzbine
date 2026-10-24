GRANT DELETE ON application_session TO __RUNTIME_ROLE__;
-- PostgreSQL row locking requires an UPDATE privilege; immutable id is sufficient.
GRANT UPDATE(id) ON application_session TO __RUNTIME_ROLE__;
-- Existing SELECT on session/account/credential_operation/external_challenge remains required.
-- The insert trigger reserves bindings; no direct identity-table write grants are needed.
