CREATE TABLE ownership_transfer (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organization(id),
    issuer_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    recipient_epoch bigint NOT NULL CHECK (recipient_epoch>=0),
    request_revision_token varchar(256) NOT NULL,
    state varchar(16) NOT NULL CHECK (state IN ('PENDING','ACCEPTED','REVOKED','EXPIRED','INVALIDATED')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
    expires_at timestamptz(3) NOT NULL,
    created_at timestamptz(3) NOT NULL,
    updated_at timestamptz(3) NOT NULL,
    CHECK (issuer_id<>recipient_id AND expires_at>created_at),
    FOREIGN KEY (organization_id,issuer_id) REFERENCES business_account(organization_id,id),
    FOREIGN KEY (organization_id,recipient_id) REFERENCES business_account(organization_id,id),
    UNIQUE (organization_id,issuer_id,request_revision_token)
);
CREATE UNIQUE INDEX uk_pending_ownership_transfer ON ownership_transfer(organization_id) WHERE state='PENDING';
CREATE FUNCTION protect_ownership_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Transfer history must be retained' USING ERRCODE='23514'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
        OR NEW.issuer_id IS DISTINCT FROM OLD.issuer_id OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
        OR NEW.recipient_epoch IS DISTINCT FROM OLD.recipient_epoch OR NEW.request_revision_token IS DISTINCT FROM OLD.request_revision_token
        OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR OLD.state<>'PENDING' OR NEW.state='PENDING' OR NEW.revision<>OLD.revision+1 THEN
        RAISE EXCEPTION 'Transfer identity and terminal outcome are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_ownership_transfer BEFORE UPDATE OR DELETE ON ownership_transfer FOR EACH ROW EXECUTE FUNCTION protect_ownership_transfer();
CREATE TABLE security_notice (
    id uuid PRIMARY KEY,
    event_key varchar(40) NOT NULL CHECK (event_key='OWNER_CHANGED'),
    resource_id uuid NOT NULL REFERENCES ownership_transfer(id),
    organization_id uuid NOT NULL,
    recipient_account_id uuid NOT NULL,
    locale varchar(64) NOT NULL,
    created_at timestamptz(3) NOT NULL,
    FOREIGN KEY (organization_id,recipient_account_id) REFERENCES business_account(organization_id,id),
    UNIQUE(event_key,resource_id,recipient_account_id)
);
CREATE TRIGGER tr_security_notice BEFORE UPDATE OR DELETE ON security_notice FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TABLE outbox_event (
    id uuid PRIMARY KEY,
    notice_id uuid NOT NULL UNIQUE REFERENCES security_notice(id),
    channel varchar(8) NOT NULL CHECK (channel='EMAIL'),
    state varchar(16) NOT NULL CHECK (state='QUEUED'),
    created_at timestamptz(3) NOT NULL
);
ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK (
    (resource_type = 'SESSION' AND action IN ('SESSION_CREATED', 'SESSION_REAUTHENTICATED',
        'SESSION_LOGGED_OUT', 'SESSION_REVOKED', 'SESSION_REVOKED_ALL', 'SESSION_EVICTED'))
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
);
UPDATE backend_schema_version SET version = 13 WHERE id = 1;
