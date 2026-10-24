CREATE TABLE account_identity (
    id uuid PRIMARY KEY,
    kind varchar(20) NOT NULL CHECK (kind IN ('BUSINESS', 'PLATFORM_ADMIN')),
    email varchar(254) COLLATE "C" NOT NULL,
    email_verified boolean NOT NULL DEFAULT false,
    display_name varchar(100) NOT NULL CHECK (length(btrim(display_name)) > 0),
    state varchar(16) NOT NULL CHECK (state IN ('PENDING', 'ACTIVE', 'DEACTIVATED')),
    language_override varchar(16) CHECK (language_override IN ('en', 'sr-Latn-RS', 'bs-Latn-BA')),
    security_epoch bigint NOT NULL DEFAULT 0 CHECK (security_epoch >= 0),
    credential_generation bigint NOT NULL DEFAULT 0 CHECK (credential_generation >= 0),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz(3) NOT NULL DEFAULT current_timestamp,
    updated_at timestamptz(3) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT uk_account_identity_kind UNIQUE (id, kind),
    CONSTRAINT uk_account_identity_email UNIQUE (email),
    CONSTRAINT ck_account_identity_email CHECK (
        email = lower(btrim(email)) AND email !~ '[^\x21-\x7E]' AND email LIKE '%@%'),
    CONSTRAINT ck_account_identity_active_verified CHECK (state <> 'ACTIVE' OR email_verified)
);

CREATE TABLE organization (
    id uuid PRIMARY KEY,
    type varchar(6) NOT NULL CHECK (type IN ('BUYER', 'VENDOR')),
    country varchar(2) NOT NULL CHECK (country IN ('RS', 'BA')),
    currency varchar(3) NOT NULL,
    display_name varchar(200) NOT NULL CHECK (length(btrim(display_name)) > 0),
    legal_name varchar(200) NOT NULL CHECK (length(btrim(legal_name)) > 0),
    registration_identifier varchar(64) NOT NULL CHECK (registration_identifier ~ '^[A-Za-z0-9/-]{1,64}$'),
    normalized_registration_identifier varchar(64) COLLATE "C"
        GENERATED ALWAYS AS (lower(registration_identifier COLLATE "C")) STORED,
    tax_identifier varchar(64) CHECK (tax_identifier ~ '^[A-Za-z0-9/-]{1,64}$'),
    address_line1 varchar(200) NOT NULL CHECK (length(btrim(address_line1)) > 0),
    address_line2 varchar(200) CHECK (length(btrim(address_line2)) > 0),
    address_city varchar(100) NOT NULL CHECK (length(btrim(address_city)) > 0),
    address_postal_code varchar(20) NOT NULL CHECK (length(btrim(address_postal_code)) > 0),
    address_country varchar(2) NOT NULL,
    address_latitude numeric CHECK (address_latitude BETWEEN -90 AND 90),
    address_longitude numeric CHECK (address_longitude BETWEEN -180 AND 180),
    default_language varchar(16) NOT NULL CHECK (default_language IN ('en', 'sr-Latn-RS', 'bs-Latn-BA')),
    state varchar(16) NOT NULL CHECK (state IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    staff_submission_restricted boolean NOT NULL DEFAULT false,
    owner_account_id uuid NOT NULL,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz(3) NOT NULL DEFAULT current_timestamp,
    updated_at timestamptz(3) NOT NULL DEFAULT current_timestamp,
    CONSTRAINT ck_organization_currency CHECK ((country = 'RS' AND currency = 'RSD')
        OR (country = 'BA' AND currency = 'BAM')),
    CONSTRAINT ck_organization_address_country CHECK (address_country = country),
    CONSTRAINT ck_organization_staff_restriction CHECK (type = 'BUYER' OR NOT staff_submission_restricted),
    CONSTRAINT uk_organization_registration UNIQUE (country, type, normalized_registration_identifier)
);

CREATE TABLE business_account (
    id uuid PRIMARY KEY,
    kind varchar(20) NOT NULL DEFAULT 'BUSINESS' CHECK (kind = 'BUSINESS'),
    organization_id uuid NOT NULL REFERENCES organization (id),
    role varchar(5) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'STAFF')),
    owner_slot boolean GENERATED ALWAYS AS (CASE WHEN role = 'OWNER' THEN true END) STORED,
    CONSTRAINT fk_business_account_identity FOREIGN KEY (id, kind) REFERENCES account_identity (id, kind),
    CONSTRAINT uk_business_account_organization UNIQUE (organization_id, id),
    CONSTRAINT uk_business_account_one_owner UNIQUE (organization_id, owner_slot) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE platform_account (
    id uuid PRIMARY KEY,
    kind varchar(20) NOT NULL DEFAULT 'PLATFORM_ADMIN' CHECK (kind = 'PLATFORM_ADMIN'),
    CONSTRAINT fk_platform_account_identity FOREIGN KEY (id, kind) REFERENCES account_identity (id, kind)
);

ALTER TABLE organization ADD CONSTRAINT fk_organization_owner
    FOREIGN KEY (id, owner_account_id) REFERENCES business_account (organization_id, id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION protect_identity_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Identity history must be retained' USING ERRCODE = '23514';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'organization' THEN
        IF NEW.country IS DISTINCT FROM OLD.country OR NEW.type IS DISTINCT FROM OLD.type THEN
            RAISE EXCEPTION 'Organization country and type are immutable' USING ERRCODE = '23514';
        END IF;
        IF OLD.state = 'CLOSED' AND NEW.state <> 'CLOSED' THEN
            RAISE EXCEPTION 'Closed organization cannot reopen' USING ERRCODE = '23514';
        END IF;
    ELSIF TG_TABLE_NAME = 'business_account' THEN
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.kind IS DISTINCT FROM OLD.kind THEN
            RAISE EXCEPTION 'Original organization binding is immutable' USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.kind IS DISTINCT FROM OLD.kind THEN
        RAISE EXCEPTION 'Account kind is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_organization_binding BEFORE UPDATE OR DELETE ON organization
    FOR EACH ROW EXECUTE FUNCTION protect_identity_binding();
CREATE TRIGGER tr_business_account_binding BEFORE UPDATE OR DELETE ON business_account
    FOR EACH ROW EXECUTE FUNCTION protect_identity_binding();
CREATE TRIGGER tr_platform_account_binding BEFORE UPDATE OR DELETE ON platform_account
    FOR EACH ROW EXECUTE FUNCTION protect_identity_binding();
CREATE TRIGGER tr_account_identity_binding BEFORE UPDATE OR DELETE ON account_identity
    FOR EACH ROW EXECUTE FUNCTION protect_identity_binding();

CREATE FUNCTION validate_account_subtype() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.kind = 'BUSINESS' AND NOT EXISTS (SELECT 1 FROM business_account WHERE id = NEW.id) THEN
        RAISE EXCEPTION 'Business identity requires its original organization' USING ERRCODE = '23514';
    ELSIF NEW.kind = 'PLATFORM_ADMIN' AND NOT EXISTS (SELECT 1 FROM platform_account WHERE id = NEW.id) THEN
        RAISE EXCEPTION 'Platform identity requires its separate account' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER tr_account_identity_subtype AFTER INSERT ON account_identity
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_account_subtype();

CREATE FUNCTION validate_organization_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target_organization uuid;
BEGIN
    IF TG_TABLE_NAME = 'organization' THEN
        target_organization := NEW.id;
    ELSIF TG_TABLE_NAME = 'business_account' THEN
        target_organization := NEW.organization_id;
    ELSE
        SELECT organization_id INTO target_organization FROM business_account WHERE id = NEW.id;
    END IF;
    -- Serialize final owner validation even for direct SQL that omitted the application lock protocol.
    PERFORM 1 FROM organization WHERE id = target_organization FOR UPDATE;
    IF target_organization IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM organization o
        JOIN business_account b ON b.organization_id = o.id AND b.id = o.owner_account_id
        JOIN account_identity a ON a.id = b.id
        WHERE o.id = target_organization AND b.role = 'OWNER' AND a.state = 'ACTIVE' AND a.email_verified
    ) THEN
        RAISE EXCEPTION 'Organization requires one active same-organization owner' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER tr_organization_owner AFTER INSERT OR UPDATE ON organization
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_organization_owner();
CREATE CONSTRAINT TRIGGER tr_business_account_owner AFTER INSERT OR UPDATE ON business_account
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_organization_owner();
CREATE CONSTRAINT TRIGGER tr_account_identity_owner AFTER INSERT OR UPDATE ON account_identity
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_organization_owner();

UPDATE backend_schema_version SET version = 2 WHERE id = 1;
