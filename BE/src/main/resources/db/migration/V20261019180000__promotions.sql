CREATE TABLE promotion(id uuid PRIMARY KEY REFERENCES catalogue_promotion_identity(id),vendor_id uuid NOT NULL REFERENCES organization(id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),definition jsonb NOT NULL,target_labels jsonb NOT NULL,starts_at timestamptz(3) NOT NULL,ends_at timestamptz(3) NOT NULL,stopped_at timestamptz(3),archived boolean NOT NULL DEFAULT false,created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL,CHECK(ends_at>starts_at AND ends_at-starts_at<=interval '366 days'),CHECK((definition->>'startsAt')::timestamptz=starts_at AND (definition->>'endsAt')::timestamptz=ends_at),CHECK(definition->>'kind' IN ('PERCENTAGE','FIXED_UNIT_PRICE')),CHECK((definition->>'value')::numeric>=0 AND (definition->>'value')::numeric<=999999999.99 AND scale((definition->>'value')::numeric)<=2),CHECK(definition->>'kind'<>'PERCENTAGE' OR ((definition->>'value')::numeric>0 AND (definition->>'value')::numeric<=100)));
ALTER TABLE promotion ADD CONSTRAINT ck_promotion_definition_shape CHECK(jsonb_typeof(definition)='object' AND definition ?& ARRAY['name','kind','value','productMode','productIds','categoryIds','buyerMode','buyerIds','startsAt','endsAt'] AND jsonb_typeof(definition->'name')='string' AND length(definition->>'name') BETWEEN 1 AND 200 AND jsonb_typeof(definition->'kind')='string' AND jsonb_typeof(definition->'value')='number' AND jsonb_typeof(definition->'productMode')='string' AND jsonb_typeof(definition->'buyerMode')='string' AND jsonb_typeof(definition->'productIds')='array' AND jsonb_typeof(definition->'categoryIds')='array' AND jsonb_typeof(definition->'buyerIds')='array');
CREATE INDEX ix_promotion_vendor_page ON promotion(vendor_id,created_at DESC,id ASC);
CREATE TABLE promotion_product(promotion_id uuid NOT NULL REFERENCES promotion(id),product_id uuid NOT NULL REFERENCES catalogue_product(id),PRIMARY KEY(promotion_id,product_id));
CREATE TABLE promotion_buyer(promotion_id uuid NOT NULL REFERENCES promotion(id),buyer_id uuid NOT NULL REFERENCES organization(id),PRIMARY KEY(promotion_id,buyer_id));
CREATE TABLE promotion_creation(promotion_id uuid PRIMARY KEY REFERENCES promotion(id),creator_id uuid NOT NULL REFERENCES account_identity(id),vendor_id uuid NOT NULL REFERENCES organization(id),payload_hash bytea NOT NULL CHECK(octet_length(payload_hash)=32),original_snapshot jsonb NOT NULL,expires_at timestamptz(3) NOT NULL);
CREATE TRIGGER tr_promotion_creation BEFORE UPDATE OR DELETE ON promotion_creation FOR EACH ROW EXECUTE FUNCTION protect_pricing_history();
CREATE TABLE promotion_history(promotion_id uuid NOT NULL REFERENCES promotion(id),revision bigint NOT NULL,actor_id uuid NOT NULL REFERENCES account_identity(id),snapshot jsonb NOT NULL,occurred_at timestamptz(3) NOT NULL,PRIMARY KEY(promotion_id,revision));
CREATE TRIGGER tr_promotion_history BEFORE UPDATE OR DELETE ON promotion_history FOR EACH ROW EXECUTE FUNCTION protect_pricing_history();
CREATE FUNCTION guard_promotion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Promotion retained' USING ERRCODE='23514';END IF;
 PERFORM id FROM organization WHERE id=NEW.vendor_id AND type='VENDOR' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM catalogue_promotion_identity WHERE id=NEW.id AND vendor_id=NEW.vendor_id) THEN RAISE EXCEPTION 'Invalid promotion vendor' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 OR NEW.archived OR NEW.stopped_at IS NOT NULL OR NEW.starts_at<=NEW.created_at OR NEW.updated_at<>NEW.created_at THEN RAISE EXCEPTION 'Invalid promotion creation' USING ERRCODE='23514';END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.vendor_id<>OLD.vendor_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at OR OLD.archived THEN RAISE EXCEPTION 'Invalid promotion transition' USING ERRCODE='23514';END IF;
  IF (NEW.definition<>OLD.definition OR NEW.target_labels<>OLD.target_labels) AND (OLD.starts_at<=NEW.updated_at OR OLD.stopped_at IS NOT NULL OR NEW.starts_at<=NEW.updated_at) THEN RAISE EXCEPTION 'Promotion definition frozen' USING ERRCODE='23514';END IF;
  IF NEW.stopped_at IS DISTINCT FROM OLD.stopped_at AND (OLD.stopped_at IS NOT NULL OR NEW.stopped_at IS NULL OR OLD.ends_at<=NEW.updated_at OR NEW.stopped_at<>NEW.updated_at OR NEW.definition<>OLD.definition OR NEW.target_labels<>OLD.target_labels) THEN RAISE EXCEPTION 'Promotion stop permanent' USING ERRCODE='23514';END IF;
  IF NEW.archived<>OLD.archived AND (NOT NEW.archived OR (OLD.stopped_at IS NULL AND OLD.ends_at>NEW.updated_at) OR NEW.definition<>OLD.definition OR NEW.target_labels<>OLD.target_labels OR NEW.stopped_at IS DISTINCT FROM OLD.stopped_at) THEN RAISE EXCEPTION 'Promotion archive requires end/stop' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_promotion_guard BEFORE INSERT OR UPDATE OR DELETE ON promotion FOR EACH ROW EXECUTE FUNCTION guard_promotion();
CREATE FUNCTION guard_promotion_target() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE vendor uuid;BEGIN
 IF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Promotion target binding immutable' USING ERRCODE='23514';END IF;
 SELECT vendor_id INTO vendor FROM promotion WHERE id=NEW.promotion_id;
 IF vendor IS NULL AND TG_TABLE_NAME='catalogue_promotion_taxonomy' THEN RETURN NEW;END IF;
 PERFORM id FROM organization WHERE id=vendor FOR UPDATE;
 IF TG_TABLE_NAME='promotion_product' THEN
  IF NOT EXISTS(SELECT 1 FROM catalogue_product WHERE id=NEW.product_id AND vendor_id=vendor) THEN RAISE EXCEPTION 'Invalid product target' USING ERRCODE='23514';END IF;
 ELSIF TG_TABLE_NAME='promotion_buyer' THEN
  IF NOT EXISTS(SELECT 1 FROM trading_relationship WHERE vendor_id=vendor AND buyer_id=NEW.buyer_id AND state='ACTIVE') THEN RAISE EXCEPTION 'Invalid buyer target' USING ERRCODE='23514';END IF;
 ELSE PERFORM require_taxonomy_reference(vendor,NEW.taxonomy_id,'CATEGORY');END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_promotion_product BEFORE INSERT OR UPDATE ON promotion_product FOR EACH ROW EXECUTE FUNCTION guard_promotion_target();
CREATE TRIGGER tr_promotion_buyer BEFORE INSERT OR UPDATE ON promotion_buyer FOR EACH ROW EXECUTE FUNCTION guard_promotion_target();
CREATE TRIGGER tr_real_promotion_category BEFORE INSERT OR UPDATE ON catalogue_promotion_taxonomy FOR EACH ROW EXECUTE FUNCTION guard_promotion_target();
CREATE FUNCTION validate_promotion_references() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;p promotion;actual uuid[];expected uuid[];field text;BEGIN
 IF TG_TABLE_NAME='promotion' THEN target=NEW.id;ELSIF TG_OP='DELETE' THEN target=OLD.promotion_id;ELSE target=NEW.promotion_id;END IF;
 SELECT * INTO p FROM promotion WHERE id=target;IF NOT FOUND THEN RETURN NULL;END IF;
 FOREACH field IN ARRAY ARRAY['productIds','categoryIds','buyerIds'] LOOP
  SELECT COALESCE(array_agg(v::uuid ORDER BY v::uuid),'{}'::uuid[]) INTO expected FROM jsonb_array_elements_text(p.definition->field) v;
  IF cardinality(expected)>1000 OR cardinality(expected)<>(SELECT count(DISTINCT x) FROM unnest(expected)x) THEN RAISE EXCEPTION 'Invalid target set' USING ERRCODE='23514';END IF;
  IF field='productIds' THEN SELECT COALESCE(array_agg(product_id ORDER BY product_id),'{}'::uuid[]) INTO actual FROM promotion_product WHERE promotion_id=target;
  ELSIF field='categoryIds' THEN SELECT COALESCE(array_agg(taxonomy_id ORDER BY taxonomy_id),'{}'::uuid[]) INTO actual FROM catalogue_promotion_taxonomy WHERE promotion_id=target;
  ELSE SELECT COALESCE(array_agg(buyer_id ORDER BY buyer_id),'{}'::uuid[]) INTO actual FROM promotion_buyer WHERE promotion_id=target;END IF;
  IF (p.archived AND cardinality(actual)<>0) OR (NOT p.archived AND actual<>expected) THEN RAISE EXCEPTION 'Promotion references inconsistent' USING ERRCODE='23514';END IF;
 END LOOP;
 IF p.definition->>'productMode' NOT IN ('ALL','SELECTED') OR p.definition->>'buyerMode' NOT IN ('ALL','SELECTED') OR
  ((p.definition->>'productMode'='ALL')<>(jsonb_array_length(p.definition->'productIds')+jsonb_array_length(p.definition->'categoryIds')=0)) OR
  ((p.definition->>'buyerMode'='ALL')<>(jsonb_array_length(p.definition->'buyerIds')=0)) THEN RAISE EXCEPTION 'Invalid target modes' USING ERRCODE='23514';END IF;RETURN NULL;END;$$;
CREATE FUNCTION validate_promotion_target_presence() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;resource uuid;p promotion;expected boolean;actual boolean;field text;BEGIN
 IF TG_OP='DELETE' THEN target=OLD.promotion_id;ELSE target=NEW.promotion_id;END IF;
 SELECT * INTO p FROM promotion WHERE id=target;IF NOT FOUND THEN RETURN NULL;END IF;
 IF TG_TABLE_NAME='promotion_product' THEN
  IF TG_OP='DELETE' THEN resource=OLD.product_id;ELSE resource=NEW.product_id;END IF;field='productIds';
  SELECT EXISTS(SELECT 1 FROM promotion_product WHERE promotion_id=target AND product_id=resource) INTO actual;
 ELSIF TG_TABLE_NAME='promotion_buyer' THEN
  IF TG_OP='DELETE' THEN resource=OLD.buyer_id;ELSE resource=NEW.buyer_id;END IF;field='buyerIds';
  SELECT EXISTS(SELECT 1 FROM promotion_buyer WHERE promotion_id=target AND buyer_id=resource) INTO actual;
 ELSE
  IF TG_OP='DELETE' THEN resource=OLD.taxonomy_id;ELSE resource=NEW.taxonomy_id;END IF;field='categoryIds';
  SELECT EXISTS(SELECT 1 FROM catalogue_promotion_taxonomy WHERE promotion_id=target AND taxonomy_id=resource) INTO actual;
 END IF;
 expected=NOT p.archived AND (p.definition->field ? resource::text);
 IF expected<>actual THEN RAISE EXCEPTION 'Promotion target inconsistent' USING ERRCODE='23514';END IF;RETURN NULL;END;$$;
CREATE CONSTRAINT TRIGGER ct_promotion_refs AFTER INSERT OR UPDATE ON promotion DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_promotion_references();
CREATE CONSTRAINT TRIGGER ct_promotion_products AFTER INSERT OR UPDATE OR DELETE ON promotion_product DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_promotion_target_presence();
CREATE CONSTRAINT TRIGGER ct_promotion_categories AFTER INSERT OR UPDATE OR DELETE ON catalogue_promotion_taxonomy DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_promotion_target_presence();
CREATE CONSTRAINT TRIGGER ct_promotion_buyers AFTER INSERT OR UPDATE OR DELETE ON promotion_buyer DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_promotion_target_presence();
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
 OR (resource_type='RELATIONSHIP' AND action IN ('TRADING_CONNECTED','TRADING_RECONNECTED','TRADING_ADMIN_CONNECTED','TRADING_DISCONNECTED','AGREED_PRICES_REVIEWED') AND actor_type IN ('BUSINESS','PLATFORM_ADMIN'))
 OR (resource_type='VENDOR_PLAN' AND action='PLAN_ASSIGNED' AND actor_type='PLATFORM_ADMIN')
 OR (resource_type='PLAN_REQUEST' AND action IN ('PLAN_REQUESTED','PLAN_WITHDRAWN','PLAN_APPROVED','PLAN_REJECTED','PLAN_SUPERSEDED'))
 OR (resource_type IN ('CATEGORY','TAG','UNIT') AND action IN ('TAXONOMY_CREATED','TAXONOMY_RENAMED','TAXONOMY_DELETED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PRODUCT' AND action IN ('PRODUCT_CREATED','PRODUCT_UPDATED','PRODUCT_ARCHIVED','PRODUCT_RESTORED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PRODUCT_PRICING' AND action='PRICING_UPDATED' AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='AGREED_PRICE' AND action IN ('AGREED_PRICE_SAVED','AGREED_PRICE_REMOVED','AGREED_PRICE_CONFIRMED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PROMOTION' AND action IN ('PROMOTION_CREATED','PROMOTION_UPDATED','PROMOTION_STOPPED','PROMOTION_ARCHIVED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=28 WHERE id=1;
