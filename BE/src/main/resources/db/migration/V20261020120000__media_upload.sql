ALTER TABLE media_asset ALTER COLUMN state SET DEFAULT 'QUEUED';
ALTER TABLE media_asset ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE media_asset ADD COLUMN failure_code varchar(80);
CREATE TABLE media_upload (
 asset_id uuid PRIMARY KEY,vendor_id uuid NOT NULL,sha256 varchar(64) NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 5242880),media_type varchar(16) NOT NULL,
 raw_key varchar(200) NOT NULL UNIQUE,fence uuid NOT NULL,lease_until timestamptz(3) NOT NULL,progress_at timestamptz(3) NOT NULL,raw_confirmed_at timestamptz(3),raw_deleted_at timestamptz(3),
 FOREIGN KEY(vendor_id,asset_id) REFERENCES media_asset(vendor_id,id),CHECK(raw_key='quarantine/'||vendor_id::text||'/'||asset_id::text),CHECK(media_type IN('image/jpeg','image/png','image/webp'))
);
CREATE TABLE media_processing_job(asset_id uuid PRIMARY KEY REFERENCES media_upload(asset_id),state varchar(12) NOT NULL CHECK(state IN('PENDING','CANCELLED')),created_at timestamptz(3) NOT NULL);
CREATE TABLE media_upload_event(id uuid PRIMARY KEY,asset_id uuid NOT NULL REFERENCES media_upload(asset_id),kind varchar(24) NOT NULL CHECK(kind IN('RESERVED','QUARANTINED','CLEANUP_CLAIMED','RAW_DELETED')),occurred_at timestamptz(3) NOT NULL);
CREATE UNIQUE INDEX uk_upload_event_once ON media_upload_event(asset_id,kind);
CREATE TRIGGER tr_upload_event_immutable BEFORE UPDATE OR DELETE ON media_upload_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_upload_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Upload source identity is retained';END IF;
 IF TG_OP='UPDATE' THEN
  IF(NEW.asset_id,NEW.vendor_id,NEW.sha256,NEW.bytes,NEW.media_type,NEW.raw_key) IS DISTINCT FROM(OLD.asset_id,OLD.vendor_id,OLD.sha256,OLD.bytes,OLD.media_type,OLD.raw_key) OR (OLD.raw_confirmed_at IS NOT NULL AND NEW.raw_confirmed_at IS DISTINCT FROM OLD.raw_confirmed_at) OR (OLD.raw_deleted_at IS NOT NULL AND NEW.raw_deleted_at IS DISTINCT FROM OLD.raw_deleted_at) THEN RAISE EXCEPTION 'Upload source identity is immutable';END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM media_asset WHERE id=NEW.asset_id AND vendor_id=NEW.vendor_id AND media_type=NEW.media_type) THEN RAISE EXCEPTION 'Upload asset differs';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_upload_source BEFORE INSERT OR UPDATE OR DELETE ON media_upload FOR EACH ROW EXECUTE FUNCTION guard_upload_source();
CREATE FUNCTION require_upload_job() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;u media_upload%ROWTYPE;a media_asset%ROWTYPE;j media_processing_job%ROWTYPE;BEGIN
 IF TG_TABLE_NAME='media_asset' THEN target=NEW.id;ELSE target=NEW.asset_id;END IF;
 SELECT * INTO u FROM media_upload WHERE asset_id=target;IF u.asset_id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO a FROM media_asset WHERE id=target;SELECT * INTO j FROM media_processing_job WHERE asset_id=target;
 IF(u.raw_confirmed_at IS NOT NULL) IS DISTINCT FROM(j.asset_id IS NOT NULL) THEN RAISE EXCEPTION 'Upload queue is incomplete';END IF;
 IF j.asset_id IS NOT NULL AND ((a.cleanup_claimed_at IS NULL AND j.state<>'PENDING') OR (a.cleanup_claimed_at IS NOT NULL AND j.state<>'CANCELLED')) THEN RAISE EXCEPTION 'Upload queue claim differs';END IF;
 IF u.raw_deleted_at IS NOT NULL AND (a.state<>'DELETED' OR a.cleanup_claimed_at IS NULL) THEN RAISE EXCEPTION 'Raw deletion claim is missing';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_upload_job AFTER INSERT OR UPDATE ON media_upload DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_upload_job();
CREATE CONSTRAINT TRIGGER ct_upload_job_source AFTER INSERT OR UPDATE ON media_processing_job DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_upload_job();
CREATE CONSTRAINT TRIGGER ct_upload_asset_job AFTER UPDATE ON media_asset DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_upload_job();
CREATE TRIGGER tr_upload_job_retained BEFORE DELETE ON media_processing_job FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
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
 OR (resource_type='ORDER' AND action IN ('ORDER_DISPATCHED','ORDER_DELIVERED','ORDER_SUBMITTED','ORDER_ACCEPTED','ORDER_REJECTED','ORDER_CANCELLED','ORDER_STAGE_CHANGED','CANCELLATION_REQUESTED','CANCELLATION_APPROVED','CANCELLATION_REJECTED','CANCELLATION_WITHDRAWN','CANCELLATION_RESOLVED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)

 OR(resource_type='ORDER_MESSAGE' AND action='MESSAGE_CREATED' AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR(resource_type='IMPORT' AND action IN('IMPORT_PREVIEWED','IMPORT_CONFIRMED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR(resource_type='ORDER_STAGE' AND action IN ('STAGE_CREATED','STAGE_RENAMED','STAGE_RETIRED','STAGES_REORDERED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR(resource_type='MEDIA_ASSET' AND action IN('UPLOAD_RESERVED','UPLOAD_QUARANTINED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);

UPDATE backend_schema_version SET version=47 WHERE id=1;
