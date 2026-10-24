GRANT SELECT ON external_delivery_retention_blocker TO __RUNTIME_ROLE__;
GRANT UPDATE(encrypted_token) ON password_reset_delivery TO __RUNTIME_ROLE__;
GRANT UPDATE(encrypted_token) ON email_change_delivery TO __RUNTIME_ROLE__;
GRANT UPDATE(encrypted_token) ON setup_delivery TO __RUNTIME_ROLE__;
GRANT UPDATE(encrypted_token) ON recovery_delivery TO __RUNTIME_ROLE__;
-- Existing source/parent SELECT and source INSERT remain; no DELETE or source metadata UPDATE.
