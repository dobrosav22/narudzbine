-- Schema57; substitute an isolated validated runtime role. Apply existing identity/session/device grants too.
GRANT SELECT ON organization,account_identity,business_account,platform_account,application_session TO __RUNTIME_ROLE__;
GRANT UPDATE(state,revision,updated_at) ON organization TO __RUNTIME_ROLE__;
GRANT UPDATE(revoked_at) ON application_session TO __RUNTIME_ROLE__;
GRANT INSERT ON audit_event TO __RUNTIME_ROLE__;
-- No account role/credential changes, commercial writes, or audit UPDATE/DELETE/TRUNCATE.
