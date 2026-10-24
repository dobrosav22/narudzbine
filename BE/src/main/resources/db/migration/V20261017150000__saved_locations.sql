ALTER TABLE organization ADD CONSTRAINT uk_organization_location_scope UNIQUE (id, country, type);
CREATE TABLE organization_location (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL,
    country varchar(2) NOT NULL,
    organization_type varchar(6) NOT NULL,
    name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
    normalized_name varchar(300) COLLATE "C" NOT NULL,
    address_line1 varchar(200) NOT NULL CHECK (length(btrim(address_line1)) > 0),
    address_line2 varchar(200),
    address_city varchar(100) NOT NULL CHECK (length(btrim(address_city)) > 0),
    address_postal_code varchar(20) NOT NULL CHECK (length(btrim(address_postal_code)) > 0),
    address_latitude numeric CHECK (address_latitude BETWEEN -90 AND 90),
    address_longitude numeric CHECK (address_longitude BETWEEN -180 AND 180),
    contact_name varchar(100),
    contact_phone varchar(30),
    contact_email varchar(254),
    instructions varchar(2000),
    state varchar(8) NOT NULL CHECK (state IN ('ACTIVE', 'ARCHIVED')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz(3) NOT NULL,
    updated_at timestamptz(3) NOT NULL,
    UNIQUE (organization_id, id),
    CONSTRAINT uk_location_name UNIQUE (organization_id, normalized_name),
    FOREIGN KEY (organization_id, country, organization_type) REFERENCES organization (id, country, type),
    CHECK ((contact_name IS NOT NULL AND contact_phone IS NOT NULL)
        OR (organization_type = 'VENDOR' AND contact_name IS NULL AND contact_phone IS NULL AND contact_email IS NULL))
);
CREATE INDEX ix_location_list ON organization_location (organization_id, created_at DESC, id);
CREATE TABLE location_creation (
    location_id uuid PRIMARY KEY REFERENCES organization_location(id),
    creator_id uuid NOT NULL REFERENCES account_identity(id),
    organization_id uuid NOT NULL,
    payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
    original_snapshot jsonb,
    expires_at timestamptz(3) NOT NULL,
    FOREIGN KEY (organization_id, location_id) REFERENCES organization_location(organization_id, id)
);
CREATE INDEX ix_location_creation_expiry ON location_creation (expires_at, location_id) WHERE original_snapshot IS NOT NULL;
CREATE FUNCTION protect_location_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Creation tombstones must be retained' USING ERRCODE = '23514';
    END IF;
    IF NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
        OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.original_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'Creation receipts are immutable except snapshot compaction' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_location_receipt BEFORE UPDATE OR DELETE ON location_creation
    FOR EACH ROW EXECUTE FUNCTION protect_location_receipt();
CREATE FUNCTION protect_location_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Location history must be retained' USING ERRCODE = '23514';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
        OR NEW.country IS DISTINCT FROM OLD.country OR NEW.organization_type IS DISTINCT FROM OLD.organization_type
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Location binding is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_location_binding BEFORE UPDATE OR DELETE ON organization_location
    FOR EACH ROW EXECUTE FUNCTION protect_location_binding();
ALTER TABLE business_account ADD COLUMN home_location_id uuid;
ALTER TABLE business_account ADD CONSTRAINT fk_business_home_location
    FOREIGN KEY (organization_id, home_location_id) REFERENCES organization_location(organization_id, id);
CREATE INDEX ix_business_home_location ON business_account (organization_id, home_location_id) WHERE home_location_id IS NOT NULL;
ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK (
    (resource_type = 'SESSION' AND action IN ('SESSION_CREATED', 'SESSION_REAUTHENTICATED',
        'SESSION_LOGGED_OUT', 'SESSION_REVOKED', 'SESSION_REVOKED_ALL', 'SESSION_EVICTED'))
    OR (resource_type = 'ACCOUNT' AND action = 'ACCOUNT_LANGUAGE_CHANGED' AND resource_id = actor_id)
    OR (resource_type = 'ORGANIZATION' AND action = 'ORGANIZATION_UPDATED' AND actor_type = 'BUSINESS'
        AND organization_id IS NOT NULL AND resource_id = organization_id)
    OR (resource_type = 'LOCATION' AND action IN ('LOCATION_CREATED','LOCATION_UPDATED','LOCATION_ARCHIVED','LOCATION_RESTORED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version = 9 WHERE id = 1;
