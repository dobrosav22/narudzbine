CREATE TABLE device_registry_guard(id integer PRIMARY KEY CHECK(id=1),environment varchar(40),project_id varchar(100),CHECK((environment IS NULL)=(project_id IS NULL)));
INSERT INTO device_registry_guard(id) VALUES (1);
CREATE TABLE push_token_claim(environment varchar(40) NOT NULL,token_hash varchar(64) NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),account_id uuid NOT NULL REFERENCES account_identity(id),PRIMARY KEY(environment,token_hash));
CREATE TABLE push_device(
 id uuid PRIMARY KEY,environment varchar(40) NOT NULL,installation_id uuid NOT NULL,account_id uuid NOT NULL REFERENCES account_identity(id),
 session_id uuid NOT NULL,platform varchar(8) NOT NULL CHECK(platform IN('WEB','ANDROID','IOS')),
 token_hash varchar(64) NOT NULL,token_envelope bytea,enabled boolean NOT NULL DEFAULT true,disabled_at timestamptz(3),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz(3) NOT NULL,
 UNIQUE(environment,installation_id),FOREIGN KEY(environment,token_hash) REFERENCES push_token_claim(environment,token_hash),
 CHECK(enabled=(token_envelope IS NOT NULL)),CHECK(enabled=(disabled_at IS NULL)),CHECK(token_envelope IS NULL OR octet_length(token_envelope) BETWEEN 29 AND 4124)
);
CREATE UNIQUE INDEX ux_push_device_active_token ON push_device(environment,token_hash) WHERE enabled;
CREATE INDEX ix_push_device_account ON push_device(account_id,created_at DESC,id);
CREATE VIEW push_device_eligibility WITH(security_invoker=true) AS
 SELECT d.*,s.absolute_expires_at,s.last_qualified_activity_at+CASE WHEN a.kind='PLATFORM_ADMIN' THEN interval '30 minutes' ELSE interval '168 hours' END AS idle_expires_at,
 COALESCE((d.enabled AND s.id IS NOT NULL AND s.revoked_at IS NULL AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending
  AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation
  AND (a.kind='PLATFORM_ADMIN' OR o.state='ACTIVE')
  AND ((s.auth_method_type='PASSWORD' AND NOT EXISTS(SELECT 1 FROM managed_password_identity p WHERE p.account_id=a.id AND NOT p.password_usable))
       OR (s.auth_method_type='EXTERNAL' AND EXISTS(SELECT 1 FROM external_identity e WHERE e.id=s.auth_method_id AND e.account_id=a.id AND e.active)))),false) AS eligible
 FROM push_device d LEFT JOIN application_session s ON s.id=d.session_id AND s.account_id=d.account_id JOIN account_identity a ON a.id=d.account_id
 LEFT JOIN business_account b ON b.id=a.id LEFT JOIN organization o ON o.id=b.organization_id;
CREATE FUNCTION protect_device_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Device ownership identity retained';END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.environment,NEW.installation_id,NEW.account_id,NEW.platform,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.environment,OLD.installation_id,OLD.account_id,OLD.platform,OLD.created_at) OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Invalid device identity or revision';END IF;
 ELSIF NEW.revision<>1 OR NOT NEW.enabled THEN RAISE EXCEPTION 'Invalid initial device';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.application_session s WHERE s.id=NEW.session_id AND s.account_id=NEW.account_id) OR NOT EXISTS(SELECT 1 FROM public.push_token_claim c WHERE c.environment=NEW.environment AND c.token_hash=NEW.token_hash AND c.account_id=NEW.account_id) THEN RAISE EXCEPTION 'Invalid device ownership';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER tr_push_device BEFORE INSERT OR UPDATE OR DELETE ON push_device FOR EACH ROW EXECUTE FUNCTION protect_device_identity();
CREATE FUNCTION protect_push_token_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Push token ownership retained';END $$;
CREATE TRIGGER tr_push_token_claim BEFORE UPDATE OR DELETE ON push_token_claim FOR EACH ROW EXECUTE FUNCTION protect_push_token_claim();
CREATE FUNCTION protect_device_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.environment IS NOT NULL OR NEW.id<>OLD.id THEN RAISE EXCEPTION 'Device project binding retained';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_device_binding BEFORE UPDATE OR DELETE ON device_registry_guard FOR EACH ROW EXECUTE FUNCTION protect_device_binding();
-- Definer permits existing narrow session/credential writers to invalidate devices atomically;
-- fixed search_path, schema-qualified relations and no direct PUBLIC execution.
CREATE FUNCTION invalidate_session_devices() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE public.push_device SET enabled=false,token_envelope=NULL,disabled_at=date_trunc('milliseconds',statement_timestamp()),revision=revision+1 WHERE session_id=OLD.id AND enabled;RETURN OLD;
 END IF;
 UPDATE public.push_device SET enabled=false,token_envelope=NULL,disabled_at=NEW.revoked_at,revision=revision+1 WHERE session_id=NEW.id AND enabled;
 RETURN NEW;END $$;
REVOKE ALL ON FUNCTION invalidate_session_devices() FROM PUBLIC;
CREATE TRIGGER tr_session_devices AFTER UPDATE OF revoked_at ON application_session FOR EACH ROW WHEN(OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL) EXECUTE FUNCTION invalidate_session_devices();
CREATE TRIGGER tr_deleted_session_devices BEFORE DELETE ON application_session FOR EACH ROW EXECUTE FUNCTION invalidate_session_devices();
CREATE FUNCTION invalidate_account_devices() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 UPDATE public.push_device SET enabled=false,token_envelope=NULL,disabled_at=date_trunc('milliseconds',statement_timestamp()),revision=revision+1 WHERE account_id=NEW.id AND enabled;
 RETURN NEW;END $$;
REVOKE ALL ON FUNCTION invalidate_account_devices() FROM PUBLIC;
CREATE TRIGGER tr_account_devices AFTER UPDATE OF security_epoch,credential_generation,state,email_verified ON account_identity FOR EACH ROW WHEN((OLD.security_epoch,OLD.credential_generation,OLD.state,OLD.email_verified) IS DISTINCT FROM (NEW.security_epoch,NEW.credential_generation,NEW.state,NEW.email_verified)) EXECUTE FUNCTION invalidate_account_devices();
-- Preserve the entire preceding audited-action policy, adding only device actions.
DO $$ DECLARE previous text;BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR (resource_type=''DEVICE'' AND action IN(''DEVICE_REGISTERED'',''DEVICE_REPLACED'',''DEVICE_REMOVED'')))',previous);
END $$;
UPDATE backend_schema_version SET version=51 WHERE id=1;
