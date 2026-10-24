CREATE TABLE credential_operation (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES account_identity(id),
    kind varchar(8) NOT NULL CHECK(kind IN ('RESET','CHANGE')),
    state varchar(16) NOT NULL CHECK(state IN ('PREPARED','APPLIED','UNKNOWN','REJECTED','COMPLETED')),
    security_epoch bigint NOT NULL CHECK(security_epoch>=0),
    credential_generation bigint NOT NULL CHECK(credential_generation>=0),
    current_session_id uuid REFERENCES application_session(id),
    created_at timestamptz(3) NOT NULL,
    updated_at timestamptz(3) NOT NULL,
    CHECK((kind='RESET' AND current_session_id IS NULL) OR (kind='CHANGE' AND current_session_id IS NOT NULL)),
    UNIQUE(id,account_id)
);
CREATE UNIQUE INDEX uk_pending_credential_operation ON credential_operation(account_id)
    WHERE state IN ('PREPARED','APPLIED','UNKNOWN');
CREATE TABLE password_reset_proof (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES account_identity(id),
    token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
    email varchar(254) NOT NULL,
    security_epoch bigint NOT NULL,
    credential_generation bigint NOT NULL,
    state varchar(12) NOT NULL CHECK(state IN ('ACTIVE','INVALIDATED','USED')),
    operation_id uuid UNIQUE REFERENCES credential_operation(id),
    created_at timestamptz(3) NOT NULL,
    expires_at timestamptz(3) NOT NULL CHECK(expires_at=created_at+interval '30 minutes'),
    CHECK((state='USED')=(operation_id IS NOT NULL)),
    FOREIGN KEY(operation_id,account_id) REFERENCES credential_operation(id,account_id)
);
CREATE UNIQUE INDEX uk_latest_password_reset ON password_reset_proof(account_id) WHERE state='ACTIVE';
CREATE TABLE password_reset_delivery (
    proof_id uuid PRIMARY KEY REFERENCES password_reset_proof(id),
    encrypted_token bytea NOT NULL CHECK(octet_length(encrypted_token)=71),
    locale varchar(64) NOT NULL,
    state varchar(12) NOT NULL CHECK(state='QUEUED'),
    created_at timestamptz(3) NOT NULL
);
ALTER TABLE security_notice DROP CONSTRAINT security_notice_event_key_check;
ALTER TABLE security_notice ADD CHECK(event_key IN ('OWNER_CHANGED','PASSWORD_CHANGED'));
ALTER TABLE security_notice DROP CONSTRAINT security_notice_resource_id_fkey;
ALTER TABLE security_notice ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE security_notice ADD FOREIGN KEY(recipient_account_id) REFERENCES account_identity(id);
ALTER TABLE security_notice ADD COLUMN ownership_transfer_id uuid REFERENCES ownership_transfer(id);
ALTER TABLE security_notice ADD COLUMN credential_operation_id uuid REFERENCES credential_operation(id);
ALTER TABLE security_notice ADD FOREIGN KEY(credential_operation_id,recipient_account_id) REFERENCES credential_operation(id,account_id);
-- Only the migrator temporarily disables the append-only trigger to backfill existing history.
ALTER TABLE security_notice DISABLE TRIGGER tr_security_notice;
UPDATE security_notice SET ownership_transfer_id=resource_id WHERE event_key='OWNER_CHANGED';
ALTER TABLE security_notice ENABLE TRIGGER tr_security_notice;
ALTER TABLE security_notice ADD CHECK (
    (event_key='OWNER_CHANGED' AND organization_id IS NOT NULL AND ownership_transfer_id IS NOT NULL AND ownership_transfer_id=resource_id AND credential_operation_id IS NULL)
    OR (event_key='PASSWORD_CHANGED' AND credential_operation_id IS NOT NULL AND credential_operation_id=resource_id AND ownership_transfer_id IS NULL)
);
ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK (
    (resource_type = 'SESSION' AND action IN ('SESSION_CREATED', 'SESSION_REAUTHENTICATED',
        'SESSION_LOGGED_OUT', 'SESSION_REVOKED', 'SESSION_REVOKED_ALL', 'SESSION_EVICTED','SESSION_PASSWORD_ROTATED'))
    OR (resource_type = 'ACCOUNT' AND action IN ('ACCOUNT_LANGUAGE_CHANGED','ACCOUNT_PROFILE_UPDATED') AND resource_id = actor_id)
    OR (resource_type = 'ORGANIZATION' AND action = 'ORGANIZATION_UPDATED' AND actor_type = 'BUSINESS'
        AND organization_id IS NOT NULL AND resource_id = organization_id)
    OR (resource_type = 'LOCATION' AND action IN ('LOCATION_CREATED','LOCATION_UPDATED','LOCATION_ARCHIVED','LOCATION_RESTORED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type = 'CONTACT' AND action IN ('CONTACT_CREATED','CONTACT_UPDATED','CONTACT_ARCHIVED','CONTACT_RESTORED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type = 'MEMBER' AND action IN ('MEMBER_ROLE_CHANGED','MEMBER_DEACTIVATED','MEMBER_REACTIVATED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type='OWNERSHIP_TRANSFER' AND action IN ('TRANSFER_REQUESTED','TRANSFER_REVOKED','TRANSFER_INVALIDATED','TRANSFER_EXPIRED','TRANSFER_ACCEPTED')
        AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type='CREDENTIAL_OPERATION' AND action IN ('PASSWORD_OPERATION_STARTED','PASSWORD_OPERATION_APPLIED',
        'PASSWORD_OPERATION_UNCERTAIN','PASSWORD_OPERATION_REJECTED','PASSWORD_OPERATION_COMPLETED'))
);
CREATE FUNCTION protect_credential_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Credential history must be retained' USING ERRCODE='23514'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.kind IS DISTINCT FROM OLD.kind
        OR NEW.security_epoch IS DISTINCT FROM OLD.security_epoch OR NEW.credential_generation IS DISTINCT FROM OLD.credential_generation
        OR NEW.current_session_id IS DISTINCT FROM OLD.current_session_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.updated_at<OLD.updated_at OR NOT (
            (OLD.state='PREPARED' AND NEW.state IN ('APPLIED','UNKNOWN','REJECTED'))
            OR (OLD.state='UNKNOWN' AND NEW.state='APPLIED') OR (OLD.state='APPLIED' AND NEW.state='COMPLETED')) THEN
        RAISE EXCEPTION 'Credential operation transition is not allowed' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_credential_operation BEFORE UPDATE OR DELETE ON credential_operation FOR EACH ROW EXECUTE FUNCTION protect_credential_operation();
CREATE FUNCTION protect_password_reset_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reset proof history must be retained' USING ERRCODE='23514'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
        OR NEW.email IS DISTINCT FROM OLD.email OR NEW.security_epoch IS DISTINCT FROM OLD.security_epoch
        OR NEW.credential_generation IS DISTINCT FROM OLD.credential_generation OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR OLD.state<>'ACTIVE' OR NEW.state NOT IN ('USED','INVALIDATED') THEN
        RAISE EXCEPTION 'Reset proof identity and terminal outcome are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_password_reset_proof BEFORE UPDATE OR DELETE ON password_reset_proof FOR EACH ROW EXECUTE FUNCTION protect_password_reset_proof();
UPDATE backend_schema_version SET version=14 WHERE id=1;
