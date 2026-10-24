-- Schema70 storage foundation; portable export feature remains default-off and under implementation.
CREATE TABLE privacy_export_job(
 id uuid PRIMARY KEY,case_id uuid NOT NULL,organization_id uuid NOT NULL,country varchar(2) NOT NULL,
 requester_id uuid NOT NULL REFERENCES business_account(id),generation integer NOT NULL CHECK(generation>0),
 state varchar(8) NOT NULL DEFAULT 'QUEUED' CHECK(state IN('QUEUED','READY','FAILED','EXPIRED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),manifest_version integer NOT NULL DEFAULT 1 CHECK(manifest_version=1),
 approved_by uuid NOT NULL REFERENCES privacy_operator(account_id),approved_session uuid NOT NULL,approved_transport varchar(7) NOT NULL CHECK(approved_transport IN('BROWSER','NATIVE')),
 approved_qualification bigint NOT NULL CHECK(approved_qualification>0),approval_audit_id uuid NOT NULL UNIQUE REFERENCES audit_event(id),
 expected_case_revision bigint NOT NULL CHECK(expected_case_revision>0),case_revision_token text NOT NULL,
 approval_digest bytea NOT NULL CHECK(octet_length(approval_digest)=32),private_reference text NOT NULL CHECK(char_length(private_reference) BETWEEN 1 AND 100 AND length(btrim(private_reference))>0),
 original_response jsonb,created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL CHECK(updated_at>=created_at),
 completed_at timestamptz(3),expires_at timestamptz(3),failure_code varchar(40),
 artifact bytea,digest bytea,byte_count integer CHECK(byte_count BETWEEN 0 AND 16777216),record_count integer CHECK(record_count BETWEEN 0 AND 100000),artifact_held boolean NOT NULL DEFAULT false,
 disclosed_at timestamptz(3),disclosure_session uuid,disclosure_transport varchar(7),disclosure_audit_id uuid UNIQUE REFERENCES audit_event(id),
 FOREIGN KEY(case_id,organization_id,country) REFERENCES privacy_case(id,organization_id,country),
 FOREIGN KEY(approved_session,approved_by) REFERENCES application_session_identity(id,account_id),
 FOREIGN KEY(disclosure_session,requester_id) REFERENCES application_session_identity(id,account_id),
 UNIQUE(case_id,id),UNIQUE(case_id,generation),
 CHECK((disclosed_at IS NULL AND disclosure_session IS NULL AND disclosure_transport IS NULL AND disclosure_audit_id IS NULL)
 OR(disclosed_at IS NOT NULL AND completed_at IS NOT NULL AND disclosed_at>=completed_at AND disclosure_session IS NOT NULL AND disclosure_transport IS NOT NULL AND disclosure_transport IN('BROWSER','NATIVE') AND disclosure_audit_id IS NOT NULL)),
 CHECK((state='QUEUED' AND revision=1 AND completed_at IS NULL AND expires_at IS NULL AND failure_code IS NULL AND artifact IS NULL AND digest IS NULL AND byte_count IS NULL AND record_count IS NULL AND NOT artifact_held AND disclosed_at IS NULL)
 OR(state='READY' AND completed_at IS NOT NULL AND completed_at>=created_at AND expires_at IS NOT NULL AND expires_at=completed_at+interval '24 hours' AND failure_code IS NULL AND artifact IS NOT NULL AND digest IS NOT NULL AND octet_length(artifact)=byte_count+28 AND octet_length(digest)=32 AND byte_count IS NOT NULL AND record_count IS NOT NULL AND NOT artifact_held)
 OR(state='FAILED' AND completed_at IS NOT NULL AND completed_at>=created_at AND expires_at IS NULL AND failure_code IN('PRIVACY_EXPORT_ROW_LIMIT','PRIVACY_EXPORT_SIZE_LIMIT','PRIVACY_EXPORT_CAPACITY_REACHED','ACCESS_REVOKED','SERVICE_UNAVAILABLE') AND failure_code IS NOT NULL AND artifact IS NULL AND digest IS NULL AND byte_count IS NULL AND record_count IS NULL AND NOT artifact_held AND disclosed_at IS NULL)
 OR(state='EXPIRED' AND expires_at IS NOT NULL AND failure_code IS NULL AND((NOT artifact_held AND artifact IS NULL AND digest IS NULL) OR(artifact_held AND artifact IS NOT NULL AND digest IS NOT NULL AND completed_at IS NOT NULL AND octet_length(artifact)=byte_count+28 AND octet_length(digest)=32 AND byte_count IS NOT NULL AND record_count IS NOT NULL))))
);
CREATE UNIQUE INDEX uq_privacy_export_live_case ON privacy_export_job(case_id) WHERE state IN('QUEUED','READY');
CREATE INDEX ix_privacy_export_queued ON privacy_export_job(created_at,id) WHERE state='QUEUED';
CREATE INDEX ix_privacy_export_expiry ON privacy_export_job(expires_at,id) WHERE state='READY';
CREATE INDEX ix_privacy_export_held ON privacy_export_job(id) WHERE artifact_held;
CREATE TABLE privacy_export_event(
 job_id uuid NOT NULL REFERENCES privacy_export_job(id),revision bigint NOT NULL,state varchar(8) NOT NULL,
 occurred_at timestamptz(3) NOT NULL,disclosed_at timestamptz(3),PRIMARY KEY(job_id,revision)
);
CREATE TRIGGER tr_privacy_export_event_retained BEFORE UPDATE OR DELETE ON privacy_export_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_privacy_export_event_no_truncate BEFORE TRUNCATE ON privacy_export_event FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE TABLE privacy_fulfillment(
 case_id uuid PRIMARY KEY REFERENCES privacy_case(id),latest_job uuid NOT NULL,revision bigint NOT NULL CHECK(revision>1),completed_at timestamptz(3),
 FOREIGN KEY(case_id,latest_job) REFERENCES privacy_export_job(case_id,id)
);
CREATE TRIGGER tr_privacy_fulfillment_no_truncate BEFORE TRUNCATE ON privacy_fulfillment FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE VIEW privacy_fulfillment_metadata AS SELECT f.case_id,f.revision,
 CASE WHEN f.completed_at IS NOT NULL THEN 'COMPLETED' WHEN j.state='READY' THEN 'READY' ELSE 'REVIEWING' END AS state
 FROM privacy_fulfillment f JOIN privacy_export_job j ON j.id=f.latest_job AND j.case_id=f.case_id;

CREATE FUNCTION protect_privacy_fulfillment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_fulfillment'::regclass OR TG_OP='DELETE' OR pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Derived fulfillment source required';END IF;
 IF TG_OP='UPDATE' AND(NEW.case_id<>OLD.case_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Fulfillment revision must advance once';END IF;
 IF NEW.revision IS DISTINCT FROM(SELECT(1+sum(revision))::bigint FROM public.privacy_export_job WHERE case_id=NEW.case_id)
 OR NEW.latest_job IS DISTINCT FROM(SELECT id FROM public.privacy_export_job WHERE case_id=NEW.case_id ORDER BY generation DESC LIMIT 1)
 OR NEW.completed_at IS DISTINCT FROM(SELECT min(disclosed_at) FROM public.privacy_export_job WHERE case_id=NEW.case_id) THEN RAISE EXCEPTION 'Fulfillment must match immutable job transitions';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_privacy_fulfillment() FROM PUBLIC;
CREATE TRIGGER tr_privacy_fulfillment_source BEFORE INSERT OR UPDATE OR DELETE ON privacy_fulfillment FOR EACH ROW EXECUTE FUNCTION protect_privacy_fulfillment();
CREATE FUNCTION record_privacy_export_transition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_export_job'::regclass THEN RAISE EXCEPTION 'Original export source required';END IF;
 IF TG_OP='INSERT' OR NEW.revision<>OLD.revision THEN
  INSERT INTO public.privacy_export_event(job_id,revision,state,occurred_at,disclosed_at) VALUES(NEW.id,NEW.revision,NEW.state,NEW.updated_at,NEW.disclosed_at);
  INSERT INTO public.privacy_fulfillment(case_id,latest_job,revision,completed_at) VALUES(NEW.case_id,NEW.id,(SELECT(1+sum(revision))::bigint FROM public.privacy_export_job WHERE case_id=NEW.case_id),(SELECT min(disclosed_at) FROM public.privacy_export_job WHERE case_id=NEW.case_id))
  ON CONFLICT(case_id) DO UPDATE SET latest_job=excluded.latest_job,revision=excluded.revision,completed_at=excluded.completed_at;
 END IF;RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION record_privacy_export_transition() FROM PUBLIC;
-- Transition recording is activated after all source guards are defined below.
-- Source/retirement guards below are mandatory. Runtime/worker grant and HTTP/manifest acceptance remain separately gated.
-- Fixed original source, named approval and narrow state transitions.
CREATE FUNCTION protect_privacy_export_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE source public.privacy_case%ROWTYPE;current_revision bigint;next_generation integer;
BEGIN
 IF TG_RELID<>'public.privacy_export_job'::regclass OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Original portable export source retained';END IF;
 IF TG_OP='INSERT' THEN
  SELECT * INTO STRICT source FROM public.privacy_case WHERE id=NEW.case_id;
  IF source.kind<>'EXPORT' OR source.organization_id<>NEW.organization_id OR source.country<>NEW.country OR source.created_at>NEW.created_at THEN RAISE EXCEPTION 'Original export case required';END IF;
  SELECT revision INTO current_revision FROM public.privacy_fulfillment WHERE case_id=NEW.case_id;
  IF coalesce(current_revision,1)<>NEW.expected_case_revision OR EXISTS(SELECT 1 FROM public.privacy_fulfillment WHERE case_id=NEW.case_id AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Current unresolved case revision required';END IF;
  SELECT coalesce(max(generation),0)+1 INTO next_generation FROM public.privacy_export_job WHERE case_id=NEW.case_id;
  NEW.requester_id=source.requester_id;NEW.generation=next_generation;
  IF NEW.state<>'QUEUED' OR NEW.revision<>1 OR NEW.updated_at<>NEW.created_at OR NEW.original_response IS NULL OR jsonb_typeof(NEW.original_response)<>'object'
  OR NEW.original_response->>'id' IS DISTINCT FROM NEW.id::text OR NEW.original_response->>'caseId' IS DISTINCT FROM NEW.case_id::text OR NEW.original_response->>'state' IS DISTINCT FROM 'QUEUED' THEN RAISE EXCEPTION 'Initial queued export required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.account_identity a JOIN public.business_account b ON b.id=a.id JOIN public.organization o ON o.id=b.organization_id
   WHERE a.id=source.requester_id AND b.organization_id=source.organization_id AND o.country=source.country AND b.role IN('OWNER','ADMIN') AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending FOR SHARE OF a,b,o) THEN RAISE EXCEPTION 'Current original requester required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.privacy_operator q JOIN public.account_identity a ON a.id=q.account_id JOIN public.application_session s ON s.account_id=a.id
   WHERE a.id=NEW.approved_by AND q.enabled AND q.revision=NEW.approved_qualification AND q.created_at<=NEW.created_at AND s.id=NEW.approved_session AND s.transport=NEW.approved_transport
   AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending AND s.revoked_at IS NULL
   AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation AND s.auth_at<=NEW.created_at AND NEW.created_at<s.auth_at+interval '300 seconds'
   AND NEW.created_at<s.absolute_expires_at AND NEW.created_at<s.last_qualified_activity_at+interval '30 minutes' FOR SHARE OF q,a,s) THEN RAISE EXCEPTION 'Current qualified export operator required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_event e WHERE e.id=NEW.approval_audit_id AND e.actor_type='PLATFORM_ADMIN' AND e.actor_id=NEW.approved_by
   AND e.action='PRIVACY_EXPORT_APPROVED' AND e.resource_type='PRIVACY_EXPORT' AND e.resource_id=NEW.id AND e.target_organization_id=NEW.organization_id AND e.target_country=NEW.country AND e.occurred_at=NEW.created_at AND length(btrim(e.reason))>0) THEN RAISE EXCEPTION 'Matching export approval audit required';END IF;
  RETURN NEW;
 END IF;
 IF OLD.original_response IS NOT NULL AND NEW.original_response IS NULL AND NEW.updated_at>=OLD.updated_at AND NEW.updated_at>=OLD.created_at+interval '168 hours'
 AND(to_jsonb(NEW)-ARRAY['original_response','updated_at'])=(to_jsonb(OLD)-ARRAY['original_response','updated_at']) THEN RETURN NEW;END IF;
 IF OLD.artifact_held AND NOT NEW.artifact_held AND OLD.state='EXPIRED' AND NEW.artifact IS NULL AND NEW.digest IS NULL AND NEW.updated_at>=OLD.updated_at
 AND(to_jsonb(NEW)-ARRAY['artifact_held','artifact','digest','updated_at'])=(to_jsonb(OLD)-ARRAY['artifact_held','artifact','digest','updated_at']) THEN
  IF public.retention_preservation_active() THEN RAISE EXCEPTION 'RETENTION_PRESERVED';END IF;RETURN NEW;
 END IF;
 IF NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Export transition must advance once';END IF;
 IF OLD.state='QUEUED' AND NEW.state='READY'
 AND(to_jsonb(NEW)-ARRAY['state','revision','updated_at','completed_at','expires_at','artifact','digest','byte_count','record_count'])=(to_jsonb(OLD)-ARRAY['state','revision','updated_at','completed_at','expires_at','artifact','digest','byte_count','record_count']) THEN
  IF NEW.completed_at<>NEW.updated_at OR NEW.completed_at>=OLD.created_at+interval '24 hours' OR NOT EXISTS(SELECT 1 FROM public.account_identity a JOIN public.business_account b ON b.id=a.id JOIN public.organization o ON o.id=b.organization_id
   WHERE a.id=NEW.requester_id AND b.organization_id=NEW.organization_id AND o.country=NEW.country AND b.role IN('OWNER','ADMIN') AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending FOR SHARE OF a,b,o) THEN RAISE EXCEPTION 'Current requester and unexpired queue required at publication';END IF;RETURN NEW;
 END IF;
 IF OLD.state='QUEUED' AND NEW.state='FAILED' AND NEW.completed_at=NEW.updated_at
 AND(to_jsonb(NEW)-ARRAY['state','revision','updated_at','completed_at','failure_code'])=(to_jsonb(OLD)-ARRAY['state','revision','updated_at','completed_at','failure_code']) THEN RETURN NEW;END IF;
 IF OLD.state='QUEUED' AND NEW.state='EXPIRED' AND NEW.expires_at=OLD.created_at+interval '24 hours' AND NEW.updated_at>=NEW.expires_at
 AND(to_jsonb(NEW)-ARRAY['state','revision','updated_at','expires_at'])=(to_jsonb(OLD)-ARRAY['state','revision','updated_at','expires_at']) THEN RETURN NEW;END IF;
 IF OLD.state='READY' AND NEW.state='EXPIRED' AND NEW.updated_at>=OLD.expires_at
 AND(to_jsonb(NEW)-ARRAY['state','revision','updated_at','artifact','digest','artifact_held'])=(to_jsonb(OLD)-ARRAY['state','revision','updated_at','artifact','digest','artifact_held']) THEN
  IF public.retention_preservation_active() THEN
   IF NOT NEW.artifact_held OR(NEW.artifact,NEW.digest) IS DISTINCT FROM(OLD.artifact,OLD.digest) THEN RAISE EXCEPTION 'Held export bytes must remain';END IF;
  ELSIF NEW.artifact_held OR NEW.artifact IS NOT NULL OR NEW.digest IS NOT NULL THEN RAISE EXCEPTION 'Expired bytes must retire';END IF;RETURN NEW;
 END IF;
 IF OLD.state='READY' AND NEW.state='READY' AND OLD.disclosed_at IS NULL AND NEW.disclosed_at=NEW.updated_at AND NEW.disclosed_at<OLD.expires_at
 AND(to_jsonb(NEW)-ARRAY['revision','updated_at','disclosed_at','disclosure_session','disclosure_transport','disclosure_audit_id'])=(to_jsonb(OLD)-ARRAY['revision','updated_at','disclosed_at','disclosure_session','disclosure_transport','disclosure_audit_id']) THEN
  IF NOT EXISTS(SELECT 1 FROM public.account_identity a JOIN public.business_account b ON b.id=a.id JOIN public.organization o ON o.id=b.organization_id JOIN public.application_session s ON s.account_id=a.id
   WHERE a.id=NEW.requester_id AND b.organization_id=NEW.organization_id AND o.country=NEW.country AND b.role IN('OWNER','ADMIN') AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending
   AND s.id=NEW.disclosure_session AND s.transport=NEW.disclosure_transport AND s.revoked_at IS NULL AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation
   AND s.auth_at<=NEW.disclosed_at AND NEW.disclosed_at<s.auth_at+interval '300 seconds' AND NEW.disclosed_at<s.absolute_expires_at FOR SHARE OF a,b,o,s) THEN RAISE EXCEPTION 'Current original requester disclosure required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_event e WHERE e.id=NEW.disclosure_audit_id AND e.actor_type='BUSINESS' AND e.actor_id=NEW.requester_id AND e.organization_id=NEW.organization_id AND e.country=NEW.country AND e.resource_type='PRIVACY_EXPORT' AND e.resource_id=NEW.id AND e.action='PRIVACY_EXPORT_DOWNLOADED' AND e.occurred_at=NEW.disclosed_at) THEN RAISE EXCEPTION 'Matching requester disclosure audit required';END IF;RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Invalid portable export transition';
END $$;
REVOKE ALL ON FUNCTION protect_privacy_export_job() FROM PUBLIC;
-- Private source binding and transition recording are installed together; no runtime grants are implicit.

DO $$ DECLARE previous text;BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR(resource_type=''PRIVACY_EXPORT'' AND ((actor_type=''PLATFORM_ADMIN'' AND target_organization_id IS NOT NULL AND action IN(''PRIVACY_EXPORT_APPROVED'',''PRIVACY_EXPORT_METADATA_READ'')) OR(actor_type=''BUSINESS'' AND organization_id IS NOT NULL AND action=''PRIVACY_EXPORT_DOWNLOADED''))))',previous);
END $$;
CREATE TRIGGER tr_privacy_export_transition AFTER INSERT OR UPDATE ON privacy_export_job FOR EACH ROW EXECUTE FUNCTION record_privacy_export_transition();
CREATE TRIGGER tr_privacy_export_job BEFORE INSERT OR UPDATE OR DELETE ON privacy_export_job FOR EACH ROW EXECUTE FUNCTION protect_privacy_export_job();
CREATE TRIGGER tr_privacy_export_job_no_truncate BEFORE TRUNCATE ON privacy_export_job FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER aa_preservation_privacy_export BEFORE UPDATE ON privacy_export_job FOR EACH ROW WHEN((OLD.original_response IS NOT NULL AND NEW.original_response IS NULL) OR(OLD.artifact IS NOT NULL AND NEW.artifact IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('privacy_export_job');
UPDATE backend_schema_version SET version=70 WHERE id=1;
