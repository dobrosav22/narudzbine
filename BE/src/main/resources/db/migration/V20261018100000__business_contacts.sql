CREATE TABLE business_contact (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organization(id),
    label varchar(100) NOT NULL CHECK (length(btrim(label)) > 0),
    contact_name varchar(100) NOT NULL CHECK (length(btrim(contact_name)) > 0),
    contact_phone varchar(30) NOT NULL CHECK (length(contact_phone) BETWEEN 3 AND 30 AND contact_phone ~ '^[+0-9 ()-]+$'),
    contact_email varchar(254),
    state varchar(8) NOT NULL CHECK (state IN ('ACTIVE','ARCHIVED')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz(3) NOT NULL,
    updated_at timestamptz(3) NOT NULL,
    UNIQUE (organization_id,id)
);
CREATE INDEX ix_contact_list ON business_contact (organization_id,created_at DESC,id);
CREATE TABLE contact_creation (
    contact_id uuid PRIMARY KEY REFERENCES business_contact(id),
    creator_id uuid NOT NULL REFERENCES account_identity(id),
    organization_id uuid NOT NULL,
    payload_hash bytea NOT NULL CHECK (octet_length(payload_hash)=32),
    original_snapshot jsonb,
    expires_at timestamptz(3) NOT NULL,
    FOREIGN KEY (organization_id,contact_id) REFERENCES business_contact(organization_id,id)
);
CREATE INDEX ix_contact_creation_expiry ON contact_creation (expires_at,contact_id) WHERE original_snapshot IS NOT NULL;
CREATE FUNCTION protect_contact_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Creation tombstones must be retained' USING ERRCODE = '23514';
    END IF;
    IF NEW.contact_id IS DISTINCT FROM OLD.contact_id OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
        OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.original_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'Creation receipts are immutable except snapshot compaction' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_contact_receipt BEFORE UPDATE OR DELETE ON contact_creation
    FOR EACH ROW EXECUTE FUNCTION protect_contact_receipt();
CREATE FUNCTION protect_contact_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Contact history must be retained' USING ERRCODE = '23514';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Contact binding is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_contact_binding BEFORE UPDATE OR DELETE ON business_contact
    FOR EACH ROW EXECUTE FUNCTION protect_contact_binding();
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
);
UPDATE backend_schema_version SET version = 11 WHERE id = 1;
