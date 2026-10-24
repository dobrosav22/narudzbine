-- No secret is cleared by migration; source identity/history remains.
CREATE VIEW external_delivery_retention_blocker AS SELECT source_kind,source_id FROM external_job WHERE state IN('SENDING','UNKNOWN');
CREATE INDEX ix_external_delivery_retention_blocker ON external_job(source_kind,source_id) WHERE state IN('SENDING','UNKNOWN');
CREATE FUNCTION guard_identity_delivery_secret() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN
  IF TG_TABLE_NAME='recovery_delivery' AND to_jsonb(NEW)->>'kind'='NOTICE' THEN RETURN NEW;END IF;
  IF NEW.encrypted_token IS NULL THEN RAISE EXCEPTION 'Initial delivery secret required';END IF;RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.encrypted_token IS NOT NULL AND NEW.encrypted_token IS NULL AND (to_jsonb(NEW)-'encrypted_token')=(to_jsonb(OLD)-'encrypted_token') THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Delivery source is immutable except one-way secret retirement';
END $$;
ALTER TABLE password_reset_delivery ALTER COLUMN encrypted_token DROP NOT NULL;
CREATE TRIGGER tr_password_reset_delivery_secret BEFORE INSERT OR UPDATE OR DELETE ON password_reset_delivery FOR EACH ROW EXECUTE FUNCTION guard_identity_delivery_secret();
CREATE INDEX ix_password_reset_delivery_secret_retention ON password_reset_delivery(created_at,proof_id) WHERE encrypted_token IS NOT NULL;
ALTER TABLE email_change_delivery ALTER COLUMN encrypted_token DROP NOT NULL;
CREATE TRIGGER tr_email_change_delivery_secret BEFORE INSERT OR UPDATE OR DELETE ON email_change_delivery FOR EACH ROW EXECUTE FUNCTION guard_identity_delivery_secret();
CREATE INDEX ix_email_change_delivery_secret_retention ON email_change_delivery(created_at,proof_id) WHERE encrypted_token IS NOT NULL;
ALTER TABLE setup_delivery ALTER COLUMN encrypted_token DROP NOT NULL;
DROP TRIGGER tr_setup_delivery ON setup_delivery;
CREATE TRIGGER tr_setup_delivery_secret BEFORE INSERT OR UPDATE OR DELETE ON setup_delivery FOR EACH ROW EXECUTE FUNCTION guard_identity_delivery_secret();
CREATE INDEX ix_setup_delivery_secret_retention ON setup_delivery(created_at,id) WHERE encrypted_token IS NOT NULL;
DROP TRIGGER tr_recovery_delivery ON recovery_delivery;
CREATE TRIGGER tr_recovery_delivery_secret BEFORE INSERT OR UPDATE OR DELETE ON recovery_delivery FOR EACH ROW EXECUTE FUNCTION guard_identity_delivery_secret();
CREATE INDEX ix_recovery_delivery_secret_retention ON recovery_delivery(created_at,id) WHERE encrypted_token IS NOT NULL;
UPDATE backend_schema_version SET version=63 WHERE id=1;
