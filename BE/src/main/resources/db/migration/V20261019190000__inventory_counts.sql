CREATE TABLE inventory_control(vendor_id uuid PRIMARY KEY REFERENCES organization(id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),enabled boolean NOT NULL DEFAULT false,confirmation_epoch bigint NOT NULL DEFAULT 1 CHECK(confirmation_epoch>0),generation bigint NOT NULL DEFAULT 1 CHECK(generation>0));
INSERT INTO inventory_control(vendor_id) SELECT id FROM organization WHERE type='VENDOR';
CREATE TABLE stock_balance(product_id uuid PRIMARY KEY REFERENCES catalogue_product(id),vendor_id uuid NOT NULL REFERENCES inventory_control(vendor_id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),available_count integer CHECK(available_count BETWEEN 0 AND 1000000000),credit_quantity bigint NOT NULL DEFAULT 0 CHECK(credit_quantity BETWEEN 0 AND 1000000000),confirmed_epoch bigint NOT NULL DEFAULT 0 CHECK(confirmed_epoch>=0),CHECK(COALESCE(available_count,0)::bigint+credit_quantity<=1000000000),CHECK(available_count IS NOT NULL OR (credit_quantity=0 AND confirmed_epoch=0)));
INSERT INTO stock_balance(product_id,vendor_id) SELECT id,vendor_id FROM catalogue_product;
CREATE TABLE stock_event(id uuid PRIMARY KEY,vendor_id uuid NOT NULL REFERENCES inventory_control(vendor_id),product_id uuid NOT NULL REFERENCES stock_balance(product_id),type varchar(20) NOT NULL CHECK(type IN ('INITIALIZED','SET','ADJUSTED','CONFIRMED')),before_count integer CHECK(before_count BETWEEN 0 AND 1000000000),after_count integer NOT NULL CHECK(after_count BETWEEN 0 AND 1000000000),delta integer NOT NULL CHECK(delta=after_count-COALESCE(before_count,0)),reason varchar(1000),actor_id uuid NOT NULL REFERENCES account_identity(id),order_id uuid CHECK(order_id IS NULL),created_at timestamptz(3) NOT NULL,CHECK((type='INITIALIZED' AND before_count IS NULL) OR (type IN ('SET','ADJUSTED') AND before_count IS NOT NULL AND before_count<>after_count) OR (type='CONFIRMED' AND before_count IS NOT NULL AND before_count=after_count)));
CREATE INDEX ix_stock_events ON stock_event(vendor_id,created_at,id);
CREATE INDEX ix_stock_product_events ON stock_event(vendor_id,product_id,created_at,id);
CREATE TRIGGER tr_stock_events BEFORE UPDATE OR DELETE ON stock_event FOR EACH ROW EXECUTE FUNCTION protect_pricing_history();
CREATE TABLE stock_replay(actor_id uuid NOT NULL REFERENCES account_identity(id),operation varchar(10) NOT NULL CHECK(operation IN ('ABSOLUTE','DELTA','CONFIRM')),identity_hash bytea NOT NULL CHECK(octet_length(identity_hash)=32),vendor_id uuid NOT NULL REFERENCES inventory_control(vendor_id),product_id uuid NOT NULL REFERENCES stock_balance(product_id),payload_hash bytea NOT NULL CHECK(octet_length(payload_hash)=32),original_result jsonb,expires_at timestamptz(3) NOT NULL,PRIMARY KEY(actor_id,operation,identity_hash));
CREATE FUNCTION protect_stock_replay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Replay tombstone retained' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'original_result') IS DISTINCT FROM (to_jsonb(OLD)-'original_result') OR NEW.original_result IS NOT NULL) THEN RAISE EXCEPTION 'Replay binding immutable' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_stock_replay BEFORE UPDATE OR DELETE ON stock_replay FOR EACH ROW EXECUTE FUNCTION protect_stock_replay();
CREATE FUNCTION guard_inventory_control() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inventory control retained' USING ERRCODE='23514';END IF;
 PERFORM id FROM organization WHERE id=NEW.vendor_id AND type='VENDOR' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Inventory vendor required' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (NEW.vendor_id<>OLD.vendor_id OR NEW.generation<>OLD.generation+1 OR NEW.confirmation_epoch NOT BETWEEN OLD.confirmation_epoch AND OLD.confirmation_epoch+1 OR NEW.revision<>OLD.revision+CASE WHEN NEW.enabled<>OLD.enabled OR NEW.confirmation_epoch<>OLD.confirmation_epoch THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Invalid inventory generation' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_inventory_control BEFORE INSERT OR UPDATE OR DELETE ON inventory_control FOR EACH ROW EXECUTE FUNCTION guard_inventory_control();
CREATE FUNCTION initialize_inventory_control() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='VENDOR' THEN INSERT INTO inventory_control(vendor_id) VALUES(NEW.id);END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_initialize_inventory AFTER INSERT ON organization FOR EACH ROW EXECUTE FUNCTION initialize_inventory_control();
CREATE FUNCTION guard_stock_balance() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE epoch bigint;BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Stock retained' USING ERRCODE='23514';END IF;
 PERFORM id FROM organization WHERE id=NEW.vendor_id FOR UPDATE;SELECT confirmation_epoch INTO epoch FROM inventory_control WHERE vendor_id=NEW.vendor_id;
 IF NOT EXISTS(SELECT 1 FROM catalogue_product WHERE id=NEW.product_id AND vendor_id=NEW.vendor_id) OR NEW.confirmed_epoch>epoch THEN RAISE EXCEPTION 'Invalid stock scope/epoch' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (NEW.product_id<>OLD.product_id OR NEW.vendor_id<>OLD.vendor_id OR NEW.revision<>OLD.revision+1 OR (OLD.available_count IS NOT NULL AND NEW.available_count IS NULL)) THEN RAISE EXCEPTION 'Invalid stock transition' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_stock_balance BEFORE INSERT OR UPDATE OR DELETE ON stock_balance FOR EACH ROW EXECUTE FUNCTION guard_stock_balance();
CREATE FUNCTION advance_inventory_generation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE inventory_control SET generation=generation+1 WHERE vendor_id=NEW.vendor_id;RETURN NEW;END;$$;
CREATE TRIGGER tr_stock_generation AFTER UPDATE ON stock_balance FOR EACH ROW EXECUTE FUNCTION advance_inventory_generation();
CREATE FUNCTION inventory_product_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='catalogue_product' THEN
  IF TG_OP='INSERT' THEN INSERT INTO stock_balance(product_id,vendor_id) VALUES(NEW.id,NEW.vendor_id);
  ELSIF NEW.pack_description IS DISTINCT FROM OLD.pack_description THEN UPDATE stock_balance SET confirmed_epoch=0,revision=revision+1 WHERE product_id=NEW.id AND confirmed_epoch<>0;END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM catalogue_product WHERE id=NEW.id) THEN RETURN NEW;END IF;
  IF NOT ((NEW.archived AND NOT OLD.archived) OR NEW.unit_id IS DISTINCT FROM OLD.unit_id OR NEW.archived<>OLD.archived OR NEW.category_id IS DISTINCT FROM OLD.category_id) THEN RETURN NEW;END IF;
  IF (NEW.archived AND NOT OLD.archived) OR NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN UPDATE stock_balance SET confirmed_epoch=0,revision=revision+1 WHERE product_id=NEW.id AND confirmed_epoch<>0;END IF;
 END IF;
 UPDATE inventory_control SET generation=generation+1 WHERE vendor_id=NEW.vendor_id;RETURN NEW;END;$$;
CREATE TRIGGER tr_initialize_product_stock AFTER INSERT OR UPDATE ON catalogue_product FOR EACH ROW EXECUTE FUNCTION inventory_product_scope();
CREATE TRIGGER tr_inventory_product_state AFTER UPDATE ON catalogue_product_identity FOR EACH ROW EXECUTE FUNCTION inventory_product_scope();
CREATE FUNCTION guard_stock_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM stock_balance WHERE product_id=NEW.product_id AND vendor_id=NEW.vendor_id) OR NOT EXISTS(SELECT 1 FROM business_account WHERE id=NEW.actor_id AND organization_id=NEW.vendor_id) THEN RAISE EXCEPTION 'Invalid stock event scope' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_stock_event_scope BEFORE INSERT ON stock_event FOR EACH ROW EXECUTE FUNCTION guard_stock_event();
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
 OR (resource_type='STOCK' AND action IN ('STOCK_INITIALIZED','STOCK_SET','STOCK_ADJUSTED','STOCK_CONFIRMED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=29 WHERE id=1;
