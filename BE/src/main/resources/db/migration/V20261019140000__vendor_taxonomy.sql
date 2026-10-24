CREATE TABLE catalogue_taxonomy (
 id uuid PRIMARY KEY,vendor_id uuid NOT NULL REFERENCES organization(id),kind varchar(8) NOT NULL CHECK(kind IN ('CATEGORY','TAG','UNIT')),
 name varchar(100) NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100 AND (kind<>'UNIT' OR length(name)<=50)),normalized_name text NOT NULL CHECK(length(normalized_name)>0),
 name_frozen boolean NOT NULL DEFAULT false CHECK(kind='UNIT' OR NOT name_frozen),deleted boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL,UNIQUE(vendor_id,id)
);
CREATE UNIQUE INDEX uk_taxonomy_name ON catalogue_taxonomy(vendor_id,kind,normalized_name) WHERE NOT deleted;
CREATE INDEX ix_taxonomy_list ON catalogue_taxonomy(vendor_id,kind,normalized_name,id) WHERE NOT deleted;
CREATE TABLE taxonomy_creation (
 resource_id uuid PRIMARY KEY,creator_id uuid NOT NULL REFERENCES account_identity(id),vendor_id uuid NOT NULL,payload_hash bytea NOT NULL CHECK(octet_length(payload_hash)=32),
 original_snapshot jsonb,expires_at timestamptz(3) NOT NULL,FOREIGN KEY(vendor_id,resource_id) REFERENCES catalogue_taxonomy(vendor_id,id)
);
CREATE INDEX ix_taxonomy_receipt_expiry ON taxonomy_creation(expires_at,resource_id) WHERE original_snapshot IS NOT NULL;
CREATE FUNCTION protect_taxonomy_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Creation history retained' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'original_snapshot') IS DISTINCT FROM (to_jsonb(OLD)-'original_snapshot') OR NEW.original_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Creation binding immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_taxonomy_receipt BEFORE UPDATE OR DELETE ON taxonomy_creation FOR EACH ROW EXECUTE FUNCTION protect_taxonomy_receipt();
ALTER TABLE catalogue_product_identity ADD COLUMN unit_id uuid REFERENCES catalogue_taxonomy(id),ADD COLUMN category_id uuid REFERENCES catalogue_taxonomy(id);
CREATE TABLE catalogue_product_tag(product_id uuid NOT NULL REFERENCES catalogue_product_identity(id),taxonomy_id uuid NOT NULL REFERENCES catalogue_taxonomy(id),PRIMARY KEY(product_id,taxonomy_id));
CREATE TABLE catalogue_promotion_identity(id uuid PRIMARY KEY,vendor_id uuid NOT NULL REFERENCES organization(id));
CREATE TABLE catalogue_promotion_taxonomy(promotion_id uuid NOT NULL REFERENCES catalogue_promotion_identity(id),taxonomy_id uuid NOT NULL REFERENCES catalogue_taxonomy(id),PRIMARY KEY(promotion_id,taxonomy_id));
CREATE INDEX ix_product_unit ON catalogue_product_identity(unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX ix_product_category ON catalogue_product_identity(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX ix_product_tag_taxonomy ON catalogue_product_tag(taxonomy_id);
CREATE INDEX ix_promotion_taxonomy ON catalogue_promotion_taxonomy(taxonomy_id);
CREATE FUNCTION require_taxonomy_reference(vendor uuid,resource uuid,expected_kind text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF resource IS NULL THEN RETURN; END IF;
 PERFORM id FROM catalogue_taxonomy WHERE id=resource AND vendor_id=vendor AND NOT deleted AND (expected_kind IS NULL OR kind=expected_kind) AND (expected_kind IS NOT NULL OR kind IN ('CATEGORY','TAG')) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid taxonomy reference' USING ERRCODE='23514'; END IF;
END; $$;
CREATE FUNCTION guard_product_taxonomy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM id FROM organization WHERE id=NEW.vendor_id FOR UPDATE;
 PERFORM require_taxonomy_reference(NEW.vendor_id,NEW.unit_id,'UNIT'); PERFORM require_taxonomy_reference(NEW.vendor_id,NEW.category_id,'CATEGORY'); RETURN NEW; END; $$;
CREATE TRIGGER tr_product_taxonomy BEFORE INSERT OR UPDATE ON catalogue_product_identity FOR EACH ROW EXECUTE FUNCTION guard_product_taxonomy();
CREATE FUNCTION guard_taxonomy_association() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE vendor uuid; BEGIN
 IF TG_TABLE_NAME='catalogue_product_tag' THEN SELECT vendor_id INTO vendor FROM catalogue_product_identity WHERE id=NEW.product_id;
 ELSE SELECT vendor_id INTO vendor FROM catalogue_promotion_identity WHERE id=NEW.promotion_id; END IF;
 PERFORM id FROM organization WHERE id=vendor FOR UPDATE;
 PERFORM require_taxonomy_reference(vendor,NEW.taxonomy_id,CASE WHEN TG_TABLE_NAME='catalogue_product_tag' THEN 'TAG' ELSE NULL END); RETURN NEW; END; $$;
CREATE TRIGGER tr_product_tag BEFORE INSERT OR UPDATE ON catalogue_product_tag FOR EACH ROW EXECUTE FUNCTION guard_taxonomy_association();
CREATE TRIGGER tr_promotion_taxonomy BEFORE INSERT OR UPDATE ON catalogue_promotion_taxonomy FOR EACH ROW EXECUTE FUNCTION guard_taxonomy_association();
CREATE FUNCTION protect_promotion_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Promotion identity retained' USING ERRCODE='23514'; END IF;
 IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Promotion binding immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_promotion_identity BEFORE UPDATE OR DELETE ON catalogue_promotion_identity FOR EACH ROW EXECUTE FUNCTION protect_promotion_identity();
CREATE FUNCTION protect_taxonomy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Taxonomy tombstones retained' USING ERRCODE='23514'; END IF;
 PERFORM id FROM organization WHERE id=NEW.vendor_id AND type='VENDOR' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vendor required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['name','normalized_name','name_frozen','deleted','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['name','normalized_name','name_frozen','deleted','revision','updated_at']) OR OLD.deleted OR (OLD.name_frozen AND (NOT NEW.name_frozen OR NEW.name<>OLD.name OR NEW.normalized_name<>OLD.normalized_name)) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Invalid taxonomy transition' USING ERRCODE='23514'; END IF;
  IF NEW.deleted AND (EXISTS(SELECT 1 FROM catalogue_product_identity WHERE unit_id=NEW.id OR category_id=NEW.id) OR EXISTS(SELECT 1 FROM catalogue_product_tag WHERE taxonomy_id=NEW.id) OR EXISTS(SELECT 1 FROM catalogue_promotion_taxonomy WHERE taxonomy_id=NEW.id)) THEN RAISE EXCEPTION 'Taxonomy still referenced' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_taxonomy BEFORE INSERT OR UPDATE OR DELETE ON catalogue_taxonomy FOR EACH ROW EXECUTE FUNCTION protect_taxonomy();
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
);
UPDATE backend_schema_version SET version=24 WHERE id=1;
