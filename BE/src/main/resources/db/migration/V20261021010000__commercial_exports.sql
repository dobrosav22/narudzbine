CREATE TABLE commercial_export(
 id uuid PRIMARY KEY,requester_id uuid NOT NULL,organization_id uuid NOT NULL,country varchar(2) NOT NULL CHECK(country IN('RS','BA')),
 kind varchar(20) NOT NULL CHECK(kind IN('ORDERS','REPORT_PRODUCTS','REPORT_BUYERS')),from_date date NOT NULL,to_date date NOT NULL CHECK(to_date>=from_date),
 original_response jsonb NOT NULL,created_at timestamptz(3) NOT NULL,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 state varchar(10) NOT NULL CHECK(state IN('QUEUED','READY','FAILED','EXPIRED')),completed_at timestamptz(3),expires_at timestamptz(3),failure_code varchar(80),
 artifact bytea,digest bytea,byte_count integer CHECK(byte_count BETWEEN 0 AND 16777216),row_count integer CHECK(row_count BETWEEN 0 AND 100000),
 FOREIGN KEY(organization_id,requester_id) REFERENCES business_account(organization_id,id),
 CHECK((state='QUEUED' AND completed_at IS NULL AND expires_at IS NULL AND failure_code IS NULL AND artifact IS NULL AND digest IS NULL AND byte_count IS NULL AND row_count IS NULL)
 OR(state='READY' AND completed_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at=completed_at+interval '24 hours' AND failure_code IS NULL AND artifact IS NOT NULL AND digest IS NOT NULL AND octet_length(artifact)=byte_count+28 AND octet_length(digest)=32 AND byte_count IS NOT NULL AND row_count IS NOT NULL)
 OR(state='FAILED' AND completed_at IS NOT NULL AND expires_at IS NULL AND failure_code IS NOT NULL AND failure_code IN('EXPORT_ROW_LIMIT','EXPORT_SIZE_LIMIT','EXPORT_CAPACITY_REACHED','REPORT_OVERFLOW','ACCESS_REVOKED') AND artifact IS NULL AND digest IS NULL AND byte_count IS NULL AND row_count IS NULL)
 OR(state='EXPIRED' AND expires_at IS NOT NULL AND failure_code IS NULL AND artifact IS NULL AND digest IS NULL))
);
CREATE INDEX ix_export_queue ON commercial_export(created_at,id) WHERE state='QUEUED';
CREATE INDEX ix_export_expiry ON commercial_export(expires_at,id) WHERE state='READY';
CREATE INDEX ix_export_requester ON commercial_export(requester_id,state);
CREATE FUNCTION guard_commercial_export() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Export identity retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUEUED' OR NEW.revision<>1 OR NEW.original_response->>'id' IS DISTINCT FROM NEW.id::text OR NEW.original_response->>'state' IS DISTINCT FROM 'QUEUED' OR NOT EXISTS(SELECT 1 FROM organization o JOIN business_account b ON b.organization_id=o.id JOIN account_identity a ON a.id=b.id WHERE o.id=NEW.organization_id AND o.country=NEW.country AND o.state='ACTIVE' AND b.id=NEW.requester_id AND a.state='ACTIVE' AND a.email_verified AND (NEW.kind<>'REPORT_BUYERS' OR o.type='VENDOR')) THEN RAISE EXCEPTION 'Invalid export source';END IF;
 ELSE
  IF (NEW.id,NEW.requester_id,NEW.organization_id,NEW.country,NEW.kind,NEW.from_date,NEW.to_date,NEW.original_response,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.requester_id,OLD.organization_id,OLD.country,OLD.kind,OLD.from_date,OLD.to_date,OLD.original_response,OLD.created_at) OR NEW.revision<>OLD.revision+1 OR NOT((OLD.state='QUEUED' AND NEW.state IN('READY','FAILED','EXPIRED')) OR(OLD.state='READY' AND NEW.state='EXPIRED')) THEN RAISE EXCEPTION 'Export identity or lifecycle immutable';END IF;
  IF OLD.state='READY' AND (NEW.completed_at,NEW.expires_at,NEW.byte_count,NEW.row_count) IS DISTINCT FROM (OLD.completed_at,OLD.expires_at,OLD.byte_count,OLD.row_count) THEN RAISE EXCEPTION 'Export metadata retained';END IF;
  IF OLD.state='QUEUED' AND NEW.state='EXPIRED' AND (NEW.expires_at IS DISTINCT FROM OLD.created_at+interval '24 hours' OR NEW.completed_at IS NOT NULL OR NEW.byte_count IS NOT NULL OR NEW.row_count IS NOT NULL) THEN RAISE EXCEPTION 'Invalid queue expiry';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER tr_commercial_export BEFORE INSERT OR UPDATE OR DELETE ON commercial_export FOR EACH ROW EXECUTE FUNCTION guard_commercial_export();
DO $$ DECLARE previous text;BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR (resource_type=''EXPORT'' AND actor_type=''BUSINESS'' AND organization_id IS NOT NULL AND action IN(''EXPORT_CREATED'',''EXPORT_DOWNLOADED'')))',previous);
END $$;
UPDATE backend_schema_version SET version=53 WHERE id=1;
