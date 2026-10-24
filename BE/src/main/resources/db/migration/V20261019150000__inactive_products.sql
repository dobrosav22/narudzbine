ALTER TABLE catalogue_product_identity ADD CONSTRAINT uk_product_vendor UNIQUE(vendor_id,id);
CREATE TABLE catalogue_product (
 id uuid PRIMARY KEY,vendor_id uuid NOT NULL,sku varchar(64) NOT NULL CHECK(sku ~ '^[A-Za-z0-9._/-]{1,64}$'),normalized_sku varchar(64) COLLATE "C" NOT NULL CHECK(normalized_sku=lower(sku COLLATE "C")),
 name varchar(200) NOT NULL CHECK(length(btrim(name))>0),normalized_name text NOT NULL,description varchar(5000),pack_description varchar(200),
 minimum_quantity integer NOT NULL DEFAULT 1 CHECK(minimum_quantity BETWEEN 1 AND 1000000000),quantity_step integer NOT NULL DEFAULT 1 CHECK(quantity_step BETWEEN 1 AND 1000000000),
 featured boolean NOT NULL DEFAULT false,unit_pack_frozen boolean NOT NULL DEFAULT false,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL,
 FOREIGN KEY(vendor_id,id) REFERENCES catalogue_product_identity(vendor_id,id)
);
CREATE INDEX ix_product_name ON catalogue_product(vendor_id,normalized_name,id);
CREATE TABLE product_sku_reservation (
 vendor_id uuid NOT NULL REFERENCES organization(id),normalized_sku varchar(64) COLLATE "C" NOT NULL CHECK(normalized_sku ~ '^[a-z0-9._/-]{1,64}$'),
 product_id uuid NOT NULL REFERENCES catalogue_product(id),retired boolean NOT NULL DEFAULT false,
 PRIMARY KEY(vendor_id,normalized_sku),UNIQUE(vendor_id,normalized_sku,product_id)
);
CREATE UNIQUE INDEX uk_product_current_sku ON product_sku_reservation(product_id) WHERE NOT retired;
ALTER TABLE catalogue_product ADD CONSTRAINT fk_product_current_code FOREIGN KEY(vendor_id,normalized_sku,id) REFERENCES product_sku_reservation(vendor_id,normalized_sku,product_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION protect_sku_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SKU history retained' USING ERRCODE='23514'; END IF;
 PERFORM id FROM organization WHERE id=NEW.vendor_id FOR UPDATE;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'retired') IS DISTINCT FROM (to_jsonb(OLD)-'retired') OR OLD.retired OR NOT NEW.retired) THEN RAISE EXCEPTION 'SKU binding immutable' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM catalogue_product WHERE id=NEW.product_id AND vendor_id=NEW.vendor_id) THEN RAISE EXCEPTION 'SKU owner mismatch' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_sku_reservation BEFORE INSERT OR UPDATE OR DELETE ON product_sku_reservation FOR EACH ROW EXECUTE FUNCTION protect_sku_reservation();
CREATE FUNCTION require_current_sku() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid; BEGIN
 IF TG_TABLE_NAME='catalogue_product' THEN target=NEW.id; ELSE target=NEW.product_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM catalogue_product d JOIN product_sku_reservation r ON r.product_id=d.id AND r.vendor_id=d.vendor_id AND r.normalized_sku=d.normalized_sku AND NOT r.retired WHERE d.id=target) THEN RAISE EXCEPTION 'A matching current SKU is required' USING ERRCODE='23514'; END IF; RETURN NULL; END; $$;
CREATE CONSTRAINT TRIGGER ct_product_current_sku AFTER INSERT OR UPDATE ON catalogue_product DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_current_sku();
CREATE CONSTRAINT TRIGGER ct_reservation_current_sku AFTER INSERT OR UPDATE ON product_sku_reservation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_current_sku();
CREATE FUNCTION protect_product_details() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Product history retained' USING ERRCODE='23514'; END IF;
 PERFORM id FROM organization WHERE id=NEW.vendor_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['sku','normalized_sku','name','normalized_name','description','pack_description','minimum_quantity','quantity_step','featured','unit_pack_frozen','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['sku','normalized_sku','name','normalized_name','description','pack_description','minimum_quantity','quantity_step','featured','unit_pack_frozen','revision','updated_at']) OR NEW.revision<>OLD.revision+1 OR (OLD.unit_pack_frozen AND (NOT NEW.unit_pack_frozen OR NEW.pack_description IS DISTINCT FROM OLD.pack_description)) THEN RAISE EXCEPTION 'Invalid product transition' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_product_details BEFORE INSERT OR UPDATE OR DELETE ON catalogue_product FOR EACH ROW EXECUTE FUNCTION protect_product_details();
CREATE FUNCTION protect_ordered_product_unit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.unit_id IS DISTINCT FROM OLD.unit_id AND EXISTS(SELECT 1 FROM catalogue_product WHERE id=OLD.id AND unit_pack_frozen) THEN RAISE EXCEPTION 'Ordered product unit immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_ordered_product_unit BEFORE UPDATE ON catalogue_product_identity FOR EACH ROW EXECUTE FUNCTION protect_ordered_product_unit();
CREATE TABLE product_creation (
 product_id uuid PRIMARY KEY REFERENCES catalogue_product(id),creator_id uuid NOT NULL REFERENCES account_identity(id),vendor_id uuid NOT NULL REFERENCES organization(id),
 payload_hash bytea NOT NULL CHECK(octet_length(payload_hash)=32),original_snapshot jsonb,expires_at timestamptz(3) NOT NULL,
 FOREIGN KEY(vendor_id,product_id) REFERENCES catalogue_product_identity(vendor_id,id)
);
CREATE INDEX ix_product_creation_expiry ON product_creation(expires_at,product_id) WHERE original_snapshot IS NOT NULL;
CREATE FUNCTION protect_product_creation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Product creation history retained' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'original_snapshot') IS DISTINCT FROM (to_jsonb(OLD)-'original_snapshot') OR NEW.original_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Creation binding immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_product_creation BEFORE UPDATE OR DELETE ON product_creation FOR EACH ROW EXECUTE FUNCTION protect_product_creation();
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
    OR (resource_type='RECOVERY_CASE' AND action IN ('RECOVERY_CREATED','RECOVERY_READ','RECOVERY_APPROVED','RECOVERY_REJECTED','RECOVERY_ACCEPTED','RECOVERY_COMPLETED'))
    OR (resource_type='SETUP' AND (actor_type='PLATFORM_ADMIN' OR (actor_type='BUSINESS' AND organization_id IS NOT NULL)) AND action IN ('SETUP_INVITED','SETUP_REVOKED','SETUP_RESENT','SETUP_PREPARED','SETUP_APPLIED','SETUP_UNCERTAIN','SETUP_REJECTED','SETUP_COMPLETED','SETUP_BLOCKED'))
 OR (resource_type='RELATIONSHIP' AND action IN ('TRADING_CONNECTED','TRADING_RECONNECTED','TRADING_ADMIN_CONNECTED','TRADING_DISCONNECTED') AND actor_type IN ('BUSINESS','PLATFORM_ADMIN'))
 OR (resource_type='VENDOR_PLAN' AND action='PLAN_ASSIGNED' AND actor_type='PLATFORM_ADMIN')
 OR (resource_type='PLAN_REQUEST' AND action IN ('PLAN_REQUESTED','PLAN_WITHDRAWN','PLAN_APPROVED','PLAN_REJECTED','PLAN_SUPERSEDED'))
 OR (resource_type IN ('CATEGORY','TAG','UNIT') AND action IN ('TAXONOMY_CREATED','TAXONOMY_RENAMED','TAXONOMY_DELETED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PRODUCT' AND action IN ('PRODUCT_CREATED','PRODUCT_UPDATED','PRODUCT_ARCHIVED','PRODUCT_RESTORED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=25 WHERE id=1;
