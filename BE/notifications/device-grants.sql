-- Apply as migration owner after schema51, using a validated isolated runtime role identifier.
GRANT SELECT,INSERT ON push_device,push_token_claim TO __RUNTIME_ROLE__;
GRANT UPDATE(session_id,token_hash,token_envelope,enabled,disabled_at,revision) ON push_device TO __RUNTIME_ROLE__;
GRANT SELECT ON device_registry_guard,push_device_eligibility TO __RUNTIME_ROLE__;
GRANT UPDATE(environment,project_id) ON device_registry_guard TO __RUNTIME_ROLE__;
-- Existing account/organization/session/password/external-method SELECT and normal guard grants
-- are required by the security-invoker eligibility view. Existing audit_event INSERT is required.
-- No direct execution of the SECURITY DEFINER invalidation functions is granted.
-- No DELETE, ownership update, schema change or provider credential access is granted.
