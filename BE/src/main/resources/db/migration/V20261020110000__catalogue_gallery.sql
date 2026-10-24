CREATE TABLE media_asset (
 id uuid PRIMARY KEY,vendor_id uuid NOT NULL REFERENCES organization(id),state varchar(12) NOT NULL CHECK(state IN ('QUEUED','PROCESSING','READY','FAILED','DELETED')),
 media_type varchar(16) NOT NULL CHECK(media_type IN ('image/jpeg','image/png','image/webp')),
 processed_key varchar(200),processed_sha256 bytea,processed_bytes integer,width integer,height integer,
 created_at timestamptz(3) NOT NULL,ready_at timestamptz(3),unreferenced_at timestamptz(3),cleanup_claimed_at timestamptz(3),
 UNIQUE(vendor_id,id),
 CHECK(state<>'READY' OR (processed_key IS NOT NULL AND processed_key ~ '^processed/[a-zA-Z0-9/-]+$' AND processed_sha256 IS NOT NULL AND octet_length(processed_sha256)=32 AND processed_bytes IS NOT NULL AND processed_bytes BETWEEN 1 AND 5242880 AND width IS NOT NULL AND width BETWEEN 1 AND 2048 AND height IS NOT NULL AND height BETWEEN 1 AND 2048 AND ready_at IS NOT NULL)),
 CHECK(unreferenced_at IS NULL OR ready_at IS NOT NULL)
);
CREATE INDEX ix_media_unreferenced ON media_asset(unreferenced_at,id) WHERE state='READY' AND unreferenced_at IS NOT NULL;
CREATE FUNCTION guard_media_vendor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization WHERE id=NEW.vendor_id AND type='VENDOR') THEN RAISE EXCEPTION 'Media vendor is required';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_media_vendor BEFORE INSERT ON media_asset FOR EACH ROW EXECUTE FUNCTION guard_media_vendor();
CREATE TABLE catalogue_product_gallery (
 product_id uuid NOT NULL,vendor_id uuid NOT NULL,position integer NOT NULL CHECK(position BETWEEN 0 AND 4),asset_id uuid NOT NULL UNIQUE,
 PRIMARY KEY(product_id,position),FOREIGN KEY(vendor_id,product_id) REFERENCES catalogue_product_identity(vendor_id,id),FOREIGN KEY(vendor_id,asset_id) REFERENCES media_asset(vendor_id,id)
);
CREATE FUNCTION guard_gallery_asset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM media_asset WHERE id=NEW.asset_id AND vendor_id=NEW.vendor_id AND state='READY' AND cleanup_claimed_at IS NULL FOR UPDATE) THEN RAISE EXCEPTION 'Gallery asset is unavailable';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER tr_gallery_asset BEFORE INSERT OR UPDATE ON catalogue_product_gallery FOR EACH ROW EXECUTE FUNCTION guard_gallery_asset();
CREATE TRIGGER tr_gallery_no_update BEFORE UPDATE ON catalogue_product_gallery FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION protect_media_asset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Media identity must be retained';END IF;
 IF (NEW.id,NEW.vendor_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.vendor_id,OLD.created_at) THEN RAISE EXCEPTION 'Media identity is immutable';END IF;
 IF OLD.state='READY' AND (NEW.media_type,NEW.processed_key,NEW.processed_sha256,NEW.processed_bytes,NEW.width,NEW.height,NEW.ready_at) IS DISTINCT FROM (OLD.media_type,OLD.processed_key,OLD.processed_sha256,OLD.processed_bytes,OLD.width,OLD.height,OLD.ready_at) THEN RAISE EXCEPTION 'Ready media proof is immutable';END IF;
 IF EXISTS(SELECT 1 FROM catalogue_product_gallery WHERE asset_id=OLD.id) AND (NEW.state<>'READY' OR NEW.cleanup_claimed_at IS NOT NULL) THEN RAISE EXCEPTION 'Referenced asset cannot be cleaned';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER tr_media_protection BEFORE UPDATE OR DELETE ON media_asset FOR EACH ROW EXECUTE FUNCTION protect_media_asset();
CREATE FUNCTION require_media_reference_timer() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;a media_asset%ROWTYPE;BEGIN
 IF TG_TABLE_NAME='media_asset' THEN target=NEW.id;ELSIF TG_OP='DELETE' THEN target=OLD.asset_id;ELSE target=NEW.asset_id;END IF;
 SELECT * INTO a FROM media_asset WHERE id=target;
 IF a.state='READY' AND ((a.unreferenced_at IS NULL) IS DISTINCT FROM EXISTS(SELECT 1 FROM catalogue_product_gallery WHERE asset_id=target)) THEN RAISE EXCEPTION 'Media reference timer differs';END IF;
 RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_asset_reference_timer AFTER INSERT OR UPDATE ON media_asset DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_media_reference_timer();
CREATE CONSTRAINT TRIGGER ct_gallery_reference_timer AFTER INSERT OR UPDATE OR DELETE ON catalogue_product_gallery DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_media_reference_timer();
CREATE FUNCTION require_contiguous_gallery() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;n integer;last_position integer;BEGIN
 IF TG_OP='DELETE' THEN target=OLD.product_id;ELSE target=NEW.product_id;END IF;
 SELECT count(*),max(position) INTO n,last_position FROM catalogue_product_gallery WHERE product_id=target;
 IF n>0 AND last_position<>n-1 THEN RAISE EXCEPTION 'Gallery positions must be contiguous';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_gallery_positions AFTER INSERT OR UPDATE OR DELETE ON catalogue_product_gallery DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_contiguous_gallery();
UPDATE backend_schema_version SET version=46 WHERE id=1;
