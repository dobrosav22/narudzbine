GRANT UPDATE(token_hash) ON password_reset_proof TO __RUNTIME_ROLE__;
GRANT UPDATE(token_hash) ON email_change_proof TO __RUNTIME_ROLE__;
GRANT UPDATE(token_hash) ON setup_email_proof TO __RUNTIME_ROLE__;
GRANT UPDATE(code_hash) ON device_verification TO __RUNTIME_ROLE__;
GRANT UPDATE(encrypted_verifier) ON external_challenge TO __RUNTIME_ROLE__;
-- Existing source/parent/view SELECT remains. No DELETE, identity-field edits or state-change permission is added.
