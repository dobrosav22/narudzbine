CREATE TABLE product_pricing(product_id uuid PRIMARY KEY REFERENCES catalogue_product(id),base_price numeric CHECK(base_price>0 AND base_price<=999999999.99 AND scale(base_price)<=2),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0));
INSERT INTO product_pricing(product_id) SELECT id FROM catalogue_product;
CREATE FUNCTION initialize_product_pricing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO product_pricing(product_id) VALUES(NEW.id); RETURN NEW; END; $$;
CREATE TRIGGER tr_initialize_product_pricing AFTER INSERT ON catalogue_product FOR EACH ROW EXECUTE FUNCTION initialize_product_pricing();
CREATE TABLE product_volume_tier(product_id uuid NOT NULL REFERENCES product_pricing(product_id),minimum_quantity integer NOT NULL CHECK(minimum_quantity BETWEEN 1 AND 1000000000),unit_price numeric NOT NULL CHECK(unit_price>0 AND unit_price<=999999999.99 AND scale(unit_price)<=2),PRIMARY KEY(product_id,minimum_quantity));
CREATE TABLE product_pricing_history(product_id uuid NOT NULL REFERENCES product_pricing(product_id),revision bigint NOT NULL CHECK(revision>1),actor_id uuid NOT NULL REFERENCES account_identity(id),base_price numeric(11,2),tiers jsonb NOT NULL,occurred_at timestamptz(3) NOT NULL,PRIMARY KEY(product_id,revision));
CREATE FUNCTION protect_pricing_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Pricing history immutable' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER tr_pricing_history BEFORE UPDATE OR DELETE ON product_pricing_history FOR EACH ROW EXECUTE FUNCTION protect_pricing_history();
CREATE FUNCTION guard_product_pricing() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE vendor uuid; BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Pricing aggregate retained' USING ERRCODE='23514'; END IF;
 SELECT vendor_id INTO vendor FROM catalogue_product WHERE id=NEW.product_id;PERFORM id FROM organization WHERE id=vendor FOR UPDATE;
 IF TG_OP='UPDATE' AND (NEW.product_id<>OLD.product_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Invalid pricing transition' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_guard_product_pricing BEFORE INSERT OR UPDATE OR DELETE ON product_pricing FOR EACH ROW EXECUTE FUNCTION guard_product_pricing();
CREATE FUNCTION guard_volume_tier() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;vendor uuid;BEGIN
 IF TG_OP='UPDATE' AND NEW.product_id<>OLD.product_id THEN RAISE EXCEPTION 'Tier binding immutable' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN target=OLD.product_id;ELSE target=NEW.product_id;END IF;
 SELECT vendor_id INTO vendor FROM catalogue_product WHERE id=target;PERFORM id FROM organization WHERE id=vendor FOR UPDATE;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_guard_volume_tier BEFORE INSERT OR UPDATE OR DELETE ON product_volume_tier FOR EACH ROW EXECUTE FUNCTION guard_volume_tier();
CREATE FUNCTION validate_product_pricing() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;base numeric;min_qty integer;step integer;invalid boolean;BEGIN
 IF TG_TABLE_NAME='catalogue_product' THEN target=NEW.id;ELSIF TG_OP='DELETE' THEN target=OLD.product_id;ELSE target=NEW.product_id;END IF;
 SELECT p.base_price,d.minimum_quantity,d.quantity_step INTO base,min_qty,step FROM catalogue_product d JOIN product_pricing p ON p.product_id=d.id WHERE d.id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pricing aggregate required' USING ERRCODE='23514';END IF;
 SELECT EXISTS(SELECT 1 FROM (SELECT minimum_quantity,unit_price,lag(unit_price,1,base) OVER(ORDER BY minimum_quantity) previous FROM product_volume_tier WHERE product_id=target)t WHERE base IS NULL OR minimum_quantity<=min_qty OR (minimum_quantity-min_qty)%step<>0 OR unit_price>=previous) INTO invalid;
 IF invalid OR (SELECT count(*) FROM product_volume_tier WHERE product_id=target)>50 THEN RAISE EXCEPTION 'Invalid resulting pricing schedule' USING ERRCODE='23514';END IF;RETURN NULL;END;$$;
CREATE CONSTRAINT TRIGGER ct_pricing_schedule AFTER INSERT OR UPDATE ON product_pricing DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_product_pricing();
CREATE CONSTRAINT TRIGGER ct_tier_schedule AFTER INSERT OR UPDATE OR DELETE ON product_volume_tier DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_product_pricing();
CREATE CONSTRAINT TRIGGER ct_product_quantity_pricing AFTER INSERT OR UPDATE ON catalogue_product DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_product_pricing();
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
 OR (resource_type='PRODUCT_PRICING' AND action='PRICING_UPDATED' AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=26 WHERE id=1;
