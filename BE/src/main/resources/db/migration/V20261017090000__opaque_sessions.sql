CREATE TABLE application_session (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES account_identity (id),
    transport varchar(7) NOT NULL CHECK (transport IN ('BROWSER', 'NATIVE')),
    token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
    csrf_token_hash bytea CHECK (octet_length(csrf_token_hash) = 32),
    device_label varchar(100) NOT NULL CHECK (length(btrim(device_label)) > 0),
    created_at timestamptz(3) NOT NULL,
    last_qualified_activity_at timestamptz(3) NOT NULL,
    absolute_expires_at timestamptz(3) NOT NULL,
    revoked_at timestamptz(3),
    auth_at timestamptz(3) NOT NULL,
    auth_method_type varchar(8) NOT NULL CHECK (auth_method_type IN ('PASSWORD', 'EXTERNAL')),
    auth_method_id uuid,
    credential_generation bigint NOT NULL CHECK (credential_generation >= 0),
    security_epoch bigint NOT NULL CHECK (security_epoch >= 0),
    CONSTRAINT uk_application_session_token UNIQUE (token_hash),
    CONSTRAINT ck_application_session_transport CHECK (
        (transport = 'BROWSER' AND csrf_token_hash IS NOT NULL)
        OR (transport = 'NATIVE' AND csrf_token_hash IS NULL)),
    CONSTRAINT ck_application_session_method CHECK (
        (auth_method_type = 'PASSWORD' AND auth_method_id IS NULL)
        OR (auth_method_type = 'EXTERNAL' AND auth_method_id IS NOT NULL)),
    CONSTRAINT ck_application_session_time CHECK (
        absolute_expires_at > created_at AND last_qualified_activity_at >= created_at)
);
CREATE INDEX ix_application_session_account ON application_session (account_id, created_at, id)
    WHERE revoked_at IS NULL;

CREATE FUNCTION protect_session_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id
        OR NEW.transport IS DISTINCT FROM OLD.transport OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.absolute_expires_at IS DISTINCT FROM OLD.absolute_expires_at THEN
        RAISE EXCEPTION 'Session identity and absolute lifetime are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.last_qualified_activity_at < OLD.last_qualified_activity_at
        OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
        RAISE EXCEPTION 'Session activity cannot regress and revocation cannot be undone' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_application_session_identity BEFORE UPDATE ON application_session
    FOR EACH ROW EXECUTE FUNCTION protect_session_identity();
UPDATE backend_schema_version SET version = 3 WHERE id = 1;
