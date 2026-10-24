ALTER TABLE media_processing_job DROP CONSTRAINT media_processing_job_state_check;
ALTER TABLE media_processing_job ADD CONSTRAINT ck_processing_state CHECK(state IN('PENDING','PROCESSING','READY','FAILED','CANCELLED'));
ALTER TABLE media_processing_job ADD COLUMN fence uuid;
ALTER TABLE media_processing_job ADD COLUMN lease_until timestamptz(3);
ALTER TABLE media_processing_job ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3);
ALTER TABLE media_processing_job ADD CONSTRAINT ck_processing_lease CHECK(state<>'PROCESSING' OR (fence IS NOT NULL AND lease_until IS NOT NULL AND attempts>0));
ALTER TABLE media_upload_event DROP CONSTRAINT media_upload_event_kind_check;
ALTER TABLE media_upload_event ADD CONSTRAINT ck_upload_event_kind CHECK(kind IN('RESERVED','QUARANTINED','CLEANUP_CLAIMED','RAW_DELETED','PROCESSING_READY','PROCESSING_FAILED'));
CREATE INDEX ix_processing_work ON media_processing_job(created_at,asset_id) WHERE state IN('PENDING','PROCESSING');
CREATE OR REPLACE FUNCTION require_upload_job() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;u media_upload%ROWTYPE;a media_asset%ROWTYPE;j media_processing_job%ROWTYPE;BEGIN
 IF TG_TABLE_NAME='media_asset' THEN target=NEW.id;ELSE target=NEW.asset_id;END IF;
 SELECT * INTO u FROM media_upload WHERE asset_id=target;IF u.asset_id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO a FROM media_asset WHERE id=target;SELECT * INTO j FROM media_processing_job WHERE asset_id=target;
 IF(u.raw_confirmed_at IS NOT NULL) IS DISTINCT FROM(j.asset_id IS NOT NULL) THEN RAISE EXCEPTION 'Upload queue is incomplete';END IF;
 IF j.asset_id IS NOT NULL THEN
  IF a.cleanup_claimed_at IS NOT NULL THEN
   IF j.state<>'CANCELLED' THEN RAISE EXCEPTION 'Upload cleanup queue differs';END IF;
  ELSIF NOT ((j.state='PENDING' AND a.state='QUEUED') OR (j.state='PROCESSING' AND a.state='PROCESSING') OR (j.state='READY' AND a.state='READY') OR (j.state='FAILED' AND a.state='FAILED')) THEN RAISE EXCEPTION 'Processing state differs';END IF;
 END IF;
 IF u.raw_deleted_at IS NOT NULL AND NOT ((a.state='DELETED' AND a.cleanup_claimed_at IS NOT NULL) OR (a.state='READY' AND j.state='READY')) THEN RAISE EXCEPTION 'Raw deletion proof missing';END IF;RETURN NULL;END $$;
CREATE FUNCTION protect_processing_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.asset_id,NEW.created_at) IS DISTINCT FROM (OLD.asset_id,OLD.created_at) OR NEW.attempts<OLD.attempts OR (OLD.state IN('READY','CANCELLED') AND NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Processing identity is immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_processing_job BEFORE UPDATE ON media_processing_job FOR EACH ROW EXECUTE FUNCTION protect_processing_job();
UPDATE backend_schema_version SET version=48 WHERE id=1;
