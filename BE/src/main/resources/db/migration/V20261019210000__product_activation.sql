ALTER TABLE catalogue_product_identity ADD COLUMN active boolean NOT NULL DEFAULT false;
ALTER TABLE catalogue_product_identity ADD CONSTRAINT ck_product_publication CHECK(NOT(active AND archived));
CREATE FUNCTION validate_active_product() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;vendor uuid;BEGIN
 IF TG_TABLE_NAME='catalogue_product_identity' OR TG_TABLE_NAME='catalogue_product' THEN target=NEW.id;ELSE target=NEW.product_id;END IF;
 SELECT vendor_id INTO vendor FROM catalogue_product_identity WHERE id=target AND active;
 IF vendor IS NULL THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM catalogue_product_identity p JOIN catalogue_product d ON d.id=p.id JOIN catalogue_taxonomy u ON u.id=p.unit_id AND u.vendor_id=p.vendor_id AND u.kind='UNIT' AND NOT u.deleted JOIN product_pricing q ON q.product_id=p.id AND q.base_price>0 WHERE p.id=target AND NOT p.archived) THEN RAISE EXCEPTION 'Active product requires valid unit and base price' USING ERRCODE='23514';END IF;
 IF TG_TABLE_NAME='catalogue_product_identity' THEN
  IF NEW.active AND (TG_OP='INSERT' OR NOT OLD.active) AND EXISTS(SELECT 1 FROM inventory_control c LEFT JOIN stock_balance b ON b.vendor_id=c.vendor_id AND b.product_id=target WHERE c.vendor_id=vendor AND c.enabled AND (b.available_count IS NULL OR b.confirmed_epoch<>c.confirmation_epoch)) THEN RAISE EXCEPTION 'Activation requires reviewed stock' USING ERRCODE='23514';END IF;
 END IF;RETURN NULL;END;$$;
CREATE CONSTRAINT TRIGGER ct_active_identity AFTER INSERT OR UPDATE ON catalogue_product_identity DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_active_product();
CREATE CONSTRAINT TRIGGER ct_active_details AFTER INSERT OR UPDATE ON catalogue_product DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_active_product();
CREATE CONSTRAINT TRIGGER ct_active_pricing AFTER INSERT OR UPDATE ON product_pricing DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_active_product();
CREATE TABLE pricing_deactivation_replay(actor_id uuid NOT NULL REFERENCES account_identity(id),product_id uuid NOT NULL REFERENCES catalogue_product(id),identity_hash bytea NOT NULL CHECK(octet_length(identity_hash)=32),original_result jsonb,expires_at timestamptz(3) NOT NULL,PRIMARY KEY(actor_id,product_id,identity_hash));
CREATE TRIGGER tr_pricing_deactivation_replay BEFORE UPDATE OR DELETE ON pricing_deactivation_replay FOR EACH ROW EXECUTE FUNCTION protect_stock_replay();
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
 OR (resource_type='PRODUCT' AND action IN ('PRODUCT_CREATED','PRODUCT_UPDATED','PRODUCT_ARCHIVED','PRODUCT_RESTORED','PRODUCT_ACTIVATED','PRODUCT_DEACTIVATED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PRODUCT_PRICING' AND action='PRICING_UPDATED' AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='AGREED_PRICE' AND action IN ('AGREED_PRICE_SAVED','AGREED_PRICE_REMOVED','AGREED_PRICE_CONFIRMED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PROMOTION' AND action IN ('PROMOTION_CREATED','PROMOTION_UPDATED','PROMOTION_STOPPED','PROMOTION_ARCHIVED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='STOCK' AND action IN ('STOCK_INITIALIZED','STOCK_SET','STOCK_ADJUSTED','STOCK_CONFIRMED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='TRACKING' AND action IN ('TRACKING_ENABLED','TRACKING_DISABLED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL AND resource_id=organization_id)
 OR (resource_type='RECONCILIATION' AND action IN ('RECONCILIATION_PREPARED','RECONCILIATION_ACKNOWLEDGED','RECONCILIATION_APPLIED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=31 WHERE id=1;
