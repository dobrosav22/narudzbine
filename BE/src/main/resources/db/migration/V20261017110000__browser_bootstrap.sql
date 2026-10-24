CREATE TABLE pre_auth_nonce (
    nonce_hash bytea PRIMARY KEY CHECK (octet_length(nonce_hash) = 32),
    binding_hash bytea NOT NULL CHECK (octet_length(binding_hash) = 32),
    expires_at timestamptz(3) NOT NULL,
    consumed_at timestamptz(3)
);
CREATE INDEX ix_pre_auth_nonce_expiry ON pre_auth_nonce(expires_at);

-- Prior random CSRF values cannot be reconstructed for bootstrap. Require fresh browser login.
UPDATE application_session SET revoked_at = current_timestamp WHERE transport = 'BROWSER' AND revoked_at IS NULL;
UPDATE backend_schema_version SET version = 5 WHERE id = 1;
