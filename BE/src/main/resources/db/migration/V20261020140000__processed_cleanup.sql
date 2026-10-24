ALTER TABLE media_asset ADD COLUMN processed_deleted_at timestamptz(3);
ALTER TABLE media_asset ADD CONSTRAINT ck_processed_deletion CHECK(processed_deleted_at IS NULL OR (state='DELETED' AND cleanup_claimed_at IS NOT NULL AND ready_at IS NOT NULL));
ALTER TABLE media_asset ADD CONSTRAINT ck_ready_deletion CHECK(state<>'DELETED' OR ready_at IS NULL OR processed_deleted_at IS NOT NULL);
CREATE TABLE media_cleanup_event (
 id uuid PRIMARY KEY,asset_id uuid NOT NULL REFERENCES media_asset(id),
 kind varchar(20) NOT NULL CHECK(kind IN('CLAIMED','DELETED')),occurred_at timestamptz(3) NOT NULL,
 UNIQUE(asset_id,kind)
);
CREATE TRIGGER tr_cleanup_event_immutable BEFORE UPDATE OR DELETE ON media_cleanup_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION require_processed_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.processed_deleted_at IS NOT NULL AND NOT (
  EXISTS(SELECT 1 FROM media_cleanup_event WHERE asset_id=NEW.id AND kind='CLAIMED' AND occurred_at=NEW.cleanup_claimed_at)
  AND EXISTS(SELECT 1 FROM media_cleanup_event WHERE asset_id=NEW.id AND kind='DELETED' AND occurred_at=NEW.processed_deleted_at)
 ) THEN RAISE EXCEPTION 'Processed cleanup evidence missing';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_processed_cleanup AFTER INSERT OR UPDATE ON media_asset DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_processed_cleanup();
CREATE OR REPLACE FUNCTION protect_media_asset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Media identity must be retained';END IF;
 IF (NEW.id,NEW.vendor_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.vendor_id,OLD.created_at) THEN RAISE EXCEPTION 'Media identity is immutable';END IF;
 IF OLD.ready_at IS NOT NULL AND (NEW.media_type,NEW.processed_key,NEW.processed_sha256,NEW.processed_bytes,NEW.width,NEW.height,NEW.ready_at) IS DISTINCT FROM (OLD.media_type,OLD.processed_key,OLD.processed_sha256,OLD.processed_bytes,OLD.width,OLD.height,OLD.ready_at) THEN RAISE EXCEPTION 'Ready media proof is immutable';END IF;
 IF (OLD.cleanup_claimed_at IS NOT NULL AND NEW.cleanup_claimed_at IS DISTINCT FROM OLD.cleanup_claimed_at) OR (OLD.processed_deleted_at IS NOT NULL AND NEW.processed_deleted_at IS DISTINCT FROM OLD.processed_deleted_at) OR (OLD.state='DELETED' AND NEW.state<>'DELETED') THEN RAISE EXCEPTION 'Cleanup evidence is immutable';END IF;
 IF EXISTS(SELECT 1 FROM catalogue_product_gallery WHERE asset_id=OLD.id) AND (NEW.state<>'READY' OR NEW.cleanup_claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Referenced asset cannot be cleaned';END IF;
 RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION require_upload_job() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;u media_upload%ROWTYPE;a media_asset%ROWTYPE;j media_processing_job%ROWTYPE;BEGIN
 IF TG_TABLE_NAME='media_asset' THEN target=NEW.id;ELSE target=NEW.asset_id;END IF;
 SELECT * INTO u FROM media_upload WHERE asset_id=target;IF u.asset_id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO a FROM media_asset WHERE id=target;SELECT * INTO j FROM media_processing_job WHERE asset_id=target;
 IF(u.raw_confirmed_at IS NOT NULL) IS DISTINCT FROM(j.asset_id IS NOT NULL) THEN RAISE EXCEPTION 'Upload queue is incomplete';END IF;
 IF j.asset_id IS NOT NULL THEN
  IF j.state='READY' THEN
   IF NOT (a.state='READY' OR (a.state='DELETED' AND a.processed_deleted_at IS NOT NULL)) THEN RAISE EXCEPTION 'Completed processing state differs';END IF;
  ELSIF a.cleanup_claimed_at IS NOT NULL THEN
   IF j.state<>'CANCELLED' THEN RAISE EXCEPTION 'Upload cleanup queue differs';END IF;
  ELSIF NOT ((j.state='PENDING' AND a.state='QUEUED') OR (j.state='PROCESSING' AND a.state='PROCESSING') OR (j.state='FAILED' AND a.state='FAILED')) THEN RAISE EXCEPTION 'Processing state differs';END IF;
 END IF;
 IF u.raw_deleted_at IS NOT NULL AND NOT ((a.state='DELETED' AND a.cleanup_claimed_at IS NOT NULL) OR (a.state='READY' AND j.state='READY')) THEN RAISE EXCEPTION 'Raw deletion proof missing';END IF;RETURN NULL;END $$;
UPDATE backend_schema_version SET version=49 WHERE id=1;
