CREATE TABLE managed_password_identity (
    account_id uuid PRIMARY KEY REFERENCES account_identity (id),
    tenant_id uuid NOT NULL,
    provider_user_id uuid NOT NULL,
    CONSTRAINT uk_managed_password_subject UNIQUE (tenant_id, provider_user_id)
);
CREATE FUNCTION protect_managed_password_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Managed credential identity cannot be reassigned' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER tr_managed_password_identity BEFORE UPDATE OR DELETE ON managed_password_identity
    FOR EACH ROW EXECUTE FUNCTION protect_managed_password_identity();

ALTER TABLE account_identity ADD COLUMN credential_operation_pending boolean NOT NULL DEFAULT false;

CREATE TABLE login_throttle_bucket (
    key_hash bytea PRIMARY KEY CHECK (octet_length(key_hash) = 32),
    blocked_until timestamptz(3) NOT NULL DEFAULT '-infinity'
);
CREATE TABLE login_attempt (
    id uuid PRIMARY KEY,
    email_key bytea NOT NULL REFERENCES login_throttle_bucket (key_hash),
    source_key bytea NOT NULL REFERENCES login_throttle_bucket (key_hash),
    attempted_at timestamptz(3) NOT NULL,
    failed boolean NOT NULL DEFAULT false
);
CREATE INDEX ix_login_attempt_source ON login_attempt (source_key, attempted_at);
CREATE INDEX ix_login_attempt_email_failure ON login_attempt (email_key, attempted_at) WHERE failed;

UPDATE backend_schema_version SET version = 4 WHERE id = 1;
