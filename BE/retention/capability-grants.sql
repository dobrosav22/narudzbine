GRANT UPDATE(code_hash) ON external_exchange TO __RUNTIME_ROLE__;
GRANT UPDATE(state_hash,browser_binding_hash,original_token_hash,native_challenge) ON external_challenge TO __RUNTIME_ROLE__;
GRANT UPDATE(token_hash,acceptance_retired) ON recovery_case TO __RUNTIME_ROLE__;
-- Existing source/parent/blocker SELECT remains. No DELETE or source identity edit grants.
