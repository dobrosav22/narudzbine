-- Assisted case intake only. No runtime fulfillment, hold override or commercial purge.
CREATE TABLE privacy_case(
 id uuid PRIMARY KEY,requester_id uuid NOT NULL,organization_id uuid NOT NULL,country varchar(2) NOT NULL CHECK(country IN('RS','BA')),
 kind varchar(10) NOT NULL CHECK(kind IN('EXPORT','REDACTION')),
 private_reason text NOT NULL CHECK(char_length(private_reason) BETWEEN 1 AND 1000 AND length(btrim(private_reason))>0),
 created_at timestamptz(3) NOT NULL,
 FOREIGN KEY(organization_id,requester_id) REFERENCES business_account(organization_id,id),
 UNIQUE(id,requester_id,organization_id,country,created_at)
);
CREATE INDEX ix_privacy_case_organization ON privacy_case(organization_id,created_at,id);
CREATE FUNCTION guard_privacy_case_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM business_account b JOIN account_identity a ON a.id=b.id JOIN organization o ON o.id=b.organization_id WHERE b.id=NEW.requester_id AND b.organization_id=NEW.organization_id AND b.role IN('OWNER','ADMIN') AND o.country=NEW.country AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending) THEN RAISE EXCEPTION 'Invalid privacy requester';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_privacy_case_source BEFORE INSERT ON privacy_case FOR EACH ROW EXECUTE FUNCTION guard_privacy_case_insert();
CREATE TRIGGER tr_privacy_case_immutable BEFORE UPDATE OR DELETE ON privacy_case FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_privacy_case_no_truncate BEFORE TRUNCATE ON privacy_case FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE VIEW privacy_case_metadata AS SELECT id,organization_id,country,kind,created_at FROM privacy_case;
CREATE TABLE privacy_case_creation(
 id uuid PRIMARY KEY,requester_id uuid NOT NULL,organization_id uuid NOT NULL,country varchar(2) NOT NULL,
 payload_digest bytea NOT NULL CHECK(octet_length(payload_digest)=32),created_at timestamptz(3) NOT NULL,original_response jsonb,
 FOREIGN KEY(id,requester_id,organization_id,country,created_at) REFERENCES privacy_case(id,requester_id,organization_id,country,created_at)
);
CREATE INDEX ix_privacy_replay_expiry ON privacy_case_creation(created_at,id) WHERE original_response IS NOT NULL;
CREATE FUNCTION guard_privacy_case_creation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Privacy replay identity retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.original_response IS NULL OR jsonb_typeof(NEW.original_response)<>'object' OR NEW.original_response->>'id' IS DISTINCT FROM NEW.id::text OR NEW.original_response->>'organizationId' IS DISTINCT FROM NEW.organization_id::text OR NEW.original_response->>'state' IS DISTINCT FROM 'REQUESTED' THEN RAISE EXCEPTION 'Invalid privacy receipt';END IF;
 ELSE
  IF (to_jsonb(NEW)-'original_response') IS DISTINCT FROM (to_jsonb(OLD)-'original_response') OR OLD.original_response IS NULL OR NEW.original_response IS NOT NULL THEN RAISE EXCEPTION 'Privacy replay identity immutable';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER tr_privacy_case_creation BEFORE INSERT OR UPDATE OR DELETE ON privacy_case_creation FOR EACH ROW EXECUTE FUNCTION guard_privacy_case_creation();
CREATE TRIGGER tr_privacy_creation_no_truncate BEFORE TRUNCATE ON privacy_case_creation FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
DO $$ DECLARE previous text;BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR (resource_type=''PRIVACY_CASE'' AND ((actor_type=''BUSINESS'' AND organization_id IS NOT NULL AND action=''PRIVACY_CASE_REQUESTED'') OR(actor_type=''PLATFORM_ADMIN'' AND target_organization_id IS NOT NULL AND action=''ADMIN_PRIVACY_CASE_READ''))))',previous);
END $$;
UPDATE backend_schema_version SET version=59 WHERE id=1;
