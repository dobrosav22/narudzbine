ALTER TABLE managed_password_identity ADD COLUMN password_usable boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION protect_managed_password_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Managed identity cannot be removed' USING ERRCODE='23514'; END IF;
    IF NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.provider_user_id IS DISTINCT FROM OLD.provider_user_id OR OLD.password_usable OR NOT NEW.password_usable
        OR NOT EXISTS (SELECT 1 FROM account_identity a JOIN credential_operation p ON p.account_id=a.id
            WHERE a.id=OLD.account_id AND a.credential_operation_pending AND p.state='APPLIED' AND p.kind IN ('RESET','CHANGE')
                AND p.security_epoch=a.security_epoch AND p.credential_generation=a.credential_generation) THEN
        RAISE EXCEPTION 'Managed credential binding is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TABLE external_identity (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES account_identity(id),
    provider varchar(8) NOT NULL CHECK(provider IN ('GOOGLE','APPLE')),
    issuer varchar(512) COLLATE "C" NOT NULL,
    subject varchar(255) COLLATE "C" NOT NULL CHECK(length(subject)>0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz(3) NOT NULL,
    updated_at timestamptz(3) NOT NULL,
    UNIQUE(issuer,subject), UNIQUE(id,account_id)
);
ALTER TABLE application_session ADD CONSTRAINT uk_session_account UNIQUE(id,account_id);
ALTER TABLE application_session ADD FOREIGN KEY(auth_method_id,account_id) REFERENCES external_identity(id,account_id);
CREATE TABLE external_challenge (
    id uuid PRIMARY KEY,
    state_hash bytea NOT NULL UNIQUE CHECK(octet_length(state_hash)=32),
    provider varchar(8) NOT NULL CHECK(provider IN ('GOOGLE','APPLE')),
    purpose varchar(16) NOT NULL CHECK(purpose IN ('LOGIN','LINK','REAUTHENTICATE')),
    transport varchar(7) NOT NULL CHECK(transport IN ('BROWSER','NATIVE')),
    return_target varchar(8) NOT NULL CHECK(return_target IN ('WEB','ANDROID','IOS')),
    native_challenge varchar(43),
    browser_binding_hash bytea CHECK(octet_length(browser_binding_hash)=32),
    encrypted_verifier bytea NOT NULL CHECK(octet_length(encrypted_verifier)=71),
    account_id uuid REFERENCES account_identity(id),
    original_session_id uuid,
    original_token_hash bytea CHECK(octet_length(original_token_hash)=32),
    security_epoch bigint,
    credential_generation bigint,
    state varchar(12) NOT NULL CHECK(state IN ('OPEN','CLAIMED','COMPLETED')),
    created_at timestamptz(3) NOT NULL,
    expires_at timestamptz(3) NOT NULL CHECK(expires_at=created_at+interval '5 minutes'),
    FOREIGN KEY(original_session_id,account_id) REFERENCES application_session(id,account_id),
    CHECK ((purpose='LOGIN' AND account_id IS NULL AND original_session_id IS NULL AND original_token_hash IS NULL
            AND security_epoch IS NULL AND credential_generation IS NULL)
        OR (purpose<>'LOGIN' AND account_id IS NOT NULL AND original_session_id IS NOT NULL AND original_token_hash IS NOT NULL
            AND security_epoch IS NOT NULL AND credential_generation IS NOT NULL)),
    CHECK ((transport='BROWSER' AND return_target='WEB' AND native_challenge IS NULL AND browser_binding_hash IS NOT NULL)
        OR (transport='NATIVE' AND return_target IN ('ANDROID','IOS') AND native_challenge IS NOT NULL AND browser_binding_hash IS NULL))
);
CREATE TABLE external_exchange (
    code_hash bytea PRIMARY KEY CHECK(octet_length(code_hash)=32),
    challenge_id uuid NOT NULL UNIQUE REFERENCES external_challenge(id),
    account_id uuid NOT NULL REFERENCES account_identity(id),
    identity_id uuid,
    issuer varchar(512) NOT NULL,
    subject varchar(255) NOT NULL,
    security_epoch bigint NOT NULL,
    credential_generation bigint NOT NULL,
    authenticated_at timestamptz(3) NOT NULL,
    expires_at timestamptz(3) NOT NULL CHECK(expires_at=authenticated_at+interval '60 seconds'),
    consumed_at timestamptz(3),
    FOREIGN KEY(identity_id,account_id) REFERENCES external_identity(id,account_id)
);
CREATE FUNCTION protect_external_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External binding history must be retained' USING ERRCODE='23514'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.provider IS DISTINCT FROM OLD.provider
        OR NEW.issuer IS DISTINCT FROM OLD.issuer OR NEW.subject IS DISTINCT FROM OLD.subject OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.active=OLD.active OR NEW.updated_at<OLD.updated_at THEN
        RAISE EXCEPTION 'External identity cannot be reassigned' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_external_identity BEFORE UPDATE OR DELETE ON external_identity FOR EACH ROW EXECUTE FUNCTION protect_external_identity();
CREATE FUNCTION protect_external_challenge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External challenge history must be retained' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state')
        OR NOT ((OLD.state='OPEN' AND NEW.state='CLAIMED') OR (OLD.state='CLAIMED' AND NEW.state='COMPLETED')) THEN
        RAISE EXCEPTION 'External challenge transition invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_external_challenge BEFORE UPDATE OR DELETE ON external_challenge FOR EACH ROW EXECUTE FUNCTION protect_external_challenge();
CREATE FUNCTION protect_external_exchange() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External exchange history must be retained' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-'consumed_at') IS DISTINCT FROM (to_jsonb(OLD)-'consumed_at')
        OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL THEN
        RAISE EXCEPTION 'External exchange is immutable and single use' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_external_exchange BEFORE UPDATE OR DELETE ON external_exchange FOR EACH ROW EXECUTE FUNCTION protect_external_exchange();
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
        'PASSWORD_OPERATION_UNCERTAIN','PASSWORD_OPERATION_REJECTED','PASSWORD_OPERATION_COMPLETED',
        'EMAIL_OPERATION_STARTED','EMAIL_OPERATION_APPLIED','EMAIL_OPERATION_UNCERTAIN','EMAIL_OPERATION_REJECTED','EMAIL_OPERATION_COMPLETED'))
    OR (resource_type='EMAIL_CHANGE' AND action IN ('EMAIL_CHANGE_REQUESTED','EMAIL_ADDRESS_VERIFIED','EMAIL_CHANGE_CANCELLED'))
    OR (resource_type='EXTERNAL_IDENTITY' AND action IN ('EXTERNAL_IDENTITY_LINKED','EXTERNAL_IDENTITY_UNLINKED'))
);
UPDATE backend_schema_version SET version=16 WHERE id=1;
