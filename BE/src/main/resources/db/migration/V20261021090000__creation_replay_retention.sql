-- Expired original create responses only; keep source/history/used identities.
ALTER TABLE promotion_creation ALTER COLUMN original_snapshot DROP NOT NULL;
ALTER TABLE commercial_export ALTER COLUMN original_response DROP NOT NULL;
CREATE FUNCTION guard_promotion_creation_retention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' AND NEW.original_snapshot IS NOT NULL THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND OLD.original_snapshot IS NOT NULL AND NEW.original_snapshot IS NULL AND(to_jsonb(NEW)-'original_snapshot')=(to_jsonb(OLD)-'original_snapshot') THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Promotion creation identity retained';
END $$;
DROP TRIGGER tr_promotion_creation ON promotion_creation;
CREATE TRIGGER tr_promotion_creation BEFORE INSERT OR UPDATE OR DELETE ON promotion_creation FOR EACH ROW EXECUTE FUNCTION guard_promotion_creation_retention();
CREATE OR REPLACE FUNCTION guard_commercial_export() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Export identity retained';END IF;
 IF TG_OP='UPDATE' AND OLD.original_response IS NOT NULL AND NEW.original_response IS NULL AND (to_jsonb(NEW)-'original_response')=(to_jsonb(OLD)-'original_response') THEN RETURN NEW;END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUEUED' OR NEW.revision<>1 OR NEW.original_response->>'id' IS DISTINCT FROM NEW.id::text OR NEW.original_response->>'state' IS DISTINCT FROM 'QUEUED' OR NOT EXISTS(SELECT 1 FROM organization o JOIN business_account b ON b.organization_id=o.id JOIN account_identity a ON a.id=b.id WHERE o.id=NEW.organization_id AND o.country=NEW.country AND o.state='ACTIVE' AND b.id=NEW.requester_id AND a.state='ACTIVE' AND a.email_verified AND (NEW.kind<>'REPORT_BUYERS' OR o.type='VENDOR')) THEN RAISE EXCEPTION 'Invalid export source';END IF;
 ELSE
  IF (NEW.id,NEW.requester_id,NEW.organization_id,NEW.country,NEW.kind,NEW.from_date,NEW.to_date,NEW.original_response,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.requester_id,OLD.organization_id,OLD.country,OLD.kind,OLD.from_date,OLD.to_date,OLD.original_response,OLD.created_at) OR NEW.revision<>OLD.revision+1 OR NOT((OLD.state='QUEUED' AND NEW.state IN('READY','FAILED','EXPIRED')) OR(OLD.state='READY' AND NEW.state='EXPIRED')) THEN RAISE EXCEPTION 'Export identity or lifecycle immutable';END IF;
  IF OLD.state='READY' AND (NEW.completed_at,NEW.expires_at,NEW.byte_count,NEW.row_count) IS DISTINCT FROM (OLD.completed_at,OLD.expires_at,OLD.byte_count,OLD.row_count) THEN RAISE EXCEPTION 'Export metadata retained';END IF;
  IF OLD.state='QUEUED' AND NEW.state='EXPIRED' AND (NEW.expires_at IS DISTINCT FROM OLD.created_at+interval '24 hours' OR NEW.completed_at IS NOT NULL OR NEW.byte_count IS NOT NULL OR NEW.row_count IS NOT NULL) THEN RAISE EXCEPTION 'Invalid queue expiry';END IF;
 END IF;RETURN NEW;
END $$;
CREATE INDEX ix_promotion_creation_retention ON promotion_creation(expires_at,promotion_id) WHERE original_snapshot IS NOT NULL;
CREATE INDEX ix_export_creation_retention ON commercial_export(created_at,id) WHERE original_response IS NOT NULL;
UPDATE backend_schema_version SET version=61 WHERE id=1;
