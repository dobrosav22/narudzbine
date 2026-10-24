CREATE TABLE inventory_preview(id uuid PRIMARY KEY,vendor_id uuid NOT NULL REFERENCES inventory_control(vendor_id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),source_generation bigint NOT NULL CHECK(source_generation>0),source_epoch bigint NOT NULL CHECK(source_epoch>0),expires_at timestamptz(3) NOT NULL,product_count bigint NOT NULL CHECK(product_count>=0),applied boolean NOT NULL DEFAULT false,sealed boolean NOT NULL DEFAULT false);
CREATE TABLE inventory_preview_line(preview_id uuid NOT NULL REFERENCES inventory_preview(id),product_id uuid NOT NULL REFERENCES stock_balance(product_id),source_revision bigint NOT NULL CHECK(source_revision>0),source_count integer CHECK(source_count BETWEEN 0 AND 1000000000),source_credit bigint NOT NULL CHECK(source_credit BETWEEN 0 AND 1000000000),available_count integer NOT NULL CHECK(available_count BETWEEN 0 AND 1000000000),acknowledged boolean NOT NULL DEFAULT false,PRIMARY KEY(preview_id,product_id),CHECK(available_count::bigint+source_credit<=1000000000));
CREATE FUNCTION protect_inventory_preview() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Preview retained' USING ERRCODE='23514';END IF;
 PERFORM id FROM organization WHERE id=NEW.vendor_id FOR UPDATE;
 IF TG_OP='INSERT' AND (NEW.revision<>1 OR NEW.applied OR NEW.sealed OR NOT EXISTS(SELECT 1 FROM inventory_control WHERE vendor_id=NEW.vendor_id AND generation=NEW.source_generation AND confirmation_epoch=NEW.source_epoch AND NOT enabled)) THEN RAISE EXCEPTION 'Invalid preview source' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['revision','applied','sealed']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','applied','sealed']) OR OLD.applied OR (OLD.sealed AND (NOT NEW.sealed OR NEW.revision<>OLD.revision+1)) OR (NOT OLD.sealed AND (NOT NEW.sealed OR NEW.revision<>OLD.revision OR NEW.applied))) THEN RAISE EXCEPTION 'Invalid preview transition' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_inventory_preview BEFORE INSERT OR UPDATE OR DELETE ON inventory_preview FOR EACH ROW EXECUTE FUNCTION protect_inventory_preview();
CREATE FUNCTION protect_inventory_preview_line() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p inventory_preview;BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Preview source retained' USING ERRCODE='23514';END IF;
 SELECT * INTO p FROM inventory_preview WHERE id=NEW.preview_id;
 PERFORM id FROM organization WHERE id=p.vendor_id FOR UPDATE;
 IF p.applied OR NOT EXISTS(SELECT 1 FROM stock_balance WHERE product_id=NEW.product_id AND vendor_id=p.vendor_id) THEN RAISE EXCEPTION 'Invalid preview scope' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' AND (p.sealed OR NEW.acknowledged OR NOT EXISTS(SELECT 1 FROM stock_balance WHERE product_id=NEW.product_id AND revision=NEW.source_revision AND available_count IS NOT DISTINCT FROM NEW.source_count AND credit_quantity=NEW.source_credit) OR NEW.available_count<>COALESCE(NEW.source_count,0)) THEN RAISE EXCEPTION 'Invalid preview snapshot' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (NOT p.sealed OR NOT NEW.acknowledged OR (to_jsonb(NEW)-ARRAY['available_count','acknowledged']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['available_count','acknowledged'])) THEN RAISE EXCEPTION 'Immutable preview source' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_inventory_preview_line BEFORE INSERT OR UPDATE OR DELETE ON inventory_preview_line FOR EACH ROW EXECUTE FUNCTION protect_inventory_preview_line();
CREATE TABLE inventory_lifecycle_replay(actor_id uuid NOT NULL REFERENCES account_identity(id),vendor_id uuid NOT NULL REFERENCES inventory_control(vendor_id),operation varchar(12) NOT NULL CHECK(operation IN ('DISABLE','ACKNOWLEDGE','ENABLE')),identity_hash bytea NOT NULL CHECK(octet_length(identity_hash)=32),original_result jsonb,expires_at timestamptz(3) NOT NULL,PRIMARY KEY(actor_id,operation,identity_hash));
CREATE TRIGGER tr_inventory_lifecycle_replay BEFORE UPDATE OR DELETE ON inventory_lifecycle_replay FOR EACH ROW EXECUTE FUNCTION protect_stock_replay();
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
 OR (resource_type='TRACKING' AND action IN ('TRACKING_ENABLED','TRACKING_DISABLED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL AND resource_id=organization_id)
 OR (resource_type='RECONCILIATION' AND action IN ('RECONCILIATION_PREPARED','RECONCILIATION_ACKNOWLEDGED','RECONCILIATION_APPLIED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=30 WHERE id=1;
