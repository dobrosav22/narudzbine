CREATE FUNCTION scoped_redaction_caller() RETURNS oid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT oid FROM pg_roles WHERE rolname=CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END $$;
REVOKE ALL ON FUNCTION scoped_redaction_caller() FROM PUBLIC;
CREATE TABLE privacy_redaction_executor(id integer PRIMARY KEY CHECK(id=1),revision bigint NOT NULL CHECK(revision>0),role_oid oid NOT NULL,environment_code varchar(40) NOT NULL CHECK(environment_code~'^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$'),enabled boolean NOT NULL,configuration_reference varchar(100) NOT NULL CHECK(configuration_reference~'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'),created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL CHECK(updated_at>=created_at));
CREATE TABLE privacy_redaction_executor_event(revision bigint PRIMARY KEY,role_oid oid NOT NULL,environment_code varchar(40) NOT NULL,enabled boolean NOT NULL,configuration_reference varchar(100) NOT NULL,occurred_at timestamptz(3) NOT NULL,database_login name NOT NULL,effective_role name NOT NULL);
CREATE FUNCTION protect_redaction_executor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_executor'::regclass OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Original redaction executor history required';END IF;
 IF TG_OP='INSERT' THEN IF NEW.revision<>1 OR NEW.created_at<>NEW.updated_at THEN RAISE EXCEPTION 'Initial executor policy required';END IF;
 ELSIF NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at OR(NEW.role_oid,NEW.environment_code,NEW.enabled,NEW.configuration_reference) IS NOT DISTINCT FROM(OLD.role_oid,OLD.environment_code,OLD.enabled,OLD.configuration_reference) THEN RAISE EXCEPTION 'Versioned executor policy change required';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=NEW.role_oid AND NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication) AND NOT has_schema_privilege(r.oid,'public','CREATE')) THEN RAISE EXCEPTION 'Restricted executor role required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_redaction_executor() FROM PUBLIC;
CREATE TRIGGER tr_redaction_executor BEFORE INSERT OR UPDATE OR DELETE ON privacy_redaction_executor FOR EACH ROW EXECUTE FUNCTION protect_redaction_executor();
CREATE FUNCTION record_redaction_executor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_executor'::regclass THEN RAISE EXCEPTION 'Original executor policy required';END IF;
 INSERT INTO public.privacy_redaction_executor_event VALUES(NEW.revision,NEW.role_oid,NEW.environment_code,NEW.enabled,NEW.configuration_reference,NEW.updated_at,session_user,CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END);RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION record_redaction_executor() FROM PUBLIC;
CREATE TRIGGER tr_redaction_executor_record AFTER INSERT OR UPDATE ON privacy_redaction_executor FOR EACH ROW EXECUTE FUNCTION record_redaction_executor();
CREATE TRIGGER tr_redaction_executor_retained BEFORE TRUNCATE ON privacy_redaction_executor FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_redaction_executor_event_retained BEFORE UPDATE OR DELETE ON privacy_redaction_executor_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_redaction_executor_event_no_truncate BEFORE TRUNCATE ON privacy_redaction_executor_event FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION protect_redaction_executor_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_executor_event'::regclass OR pg_trigger_depth()<2 OR NEW.database_login<>session_user OR NEW.effective_role<>(CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END) OR NOT EXISTS(SELECT 1 FROM public.privacy_redaction_executor p WHERE(p.revision,p.role_oid,p.environment_code,p.enabled,p.configuration_reference,p.updated_at)=(NEW.revision,NEW.role_oid,NEW.environment_code,NEW.enabled,NEW.configuration_reference,NEW.occurred_at)) THEN RAISE EXCEPTION 'Derived executor policy evidence required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_redaction_executor_event() FROM PUBLIC;
CREATE TRIGGER tr_redaction_executor_event_source BEFORE INSERT ON privacy_redaction_executor_event FOR EACH ROW EXECUTE FUNCTION protect_redaction_executor_event();

CREATE FUNCTION scoped_redaction_references(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(value)<>'object' THEN false ELSE value ?& ARRAY['requesterVerification','legalApplicability','containment','retainedScope'] AND(SELECT count(*) FROM jsonb_object_keys(value))=4
 AND NOT EXISTS(SELECT 1 FROM jsonb_each(value) e WHERE jsonb_typeof(e.value)<>'string' OR(e.value#>>'{}')!~'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$') END
$$;
CREATE FUNCTION scoped_redaction_intent(uuid,uuid,integer,uuid,text,uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb)
 RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT convert_to(jsonb_build_object('version',1,'planId',$1,'caseId',$2,'sequence',$3,'organizationId',$4,'country',$5,'subjectAccountId',$6,'scopePolicy','ACCOUNT_DISPLAY_NAME_V1','expectedProfileRevision',$7,'fieldAction','PSEUDONYMIZE_DISPLAY_NAME','replacement','[redacted]','approvedBy',$8,'qualificationRevision',$9,'reviewAuthorizationId',$10,'approvalAuditId',$11,'approvedAt',to_char($12 AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'references',$13,'wholeCaseFulfillment',false)::text,'UTF8') $$;
CREATE FUNCTION scoped_redaction_completion(uuid,uuid,integer,uuid,text,uuid,uuid,text,timestamptz,bigint,boolean,text)
 RETURNS bytea LANGUAGE sql IMMUTABLE AS $$ SELECT convert_to(jsonb_build_object('version',1,'planId',$1,'caseId',$2,'sequence',$3,'organizationId',$4,'country',$5,'scopePolicy','ACCOUNT_DISPLAY_NAME_V1','outcome',$8,'resolutionActorId',$6,'resolutionAuditId',$7,'resolvedAt',to_char($9 AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'profileRevisionAfter',$10,'fieldChanged',$11,'intentCiphertextSha256',$12,'wholeCaseFulfillment',false)::text,'UTF8') $$;

CREATE TABLE privacy_redaction_job(
 id uuid PRIMARY KEY CHECK(id::text~'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),case_id uuid NOT NULL,organization_id uuid NOT NULL,country varchar(2) NOT NULL,requester_id uuid NOT NULL,
 generation integer NOT NULL CHECK(generation BETWEEN 1 AND 1000000000),scope_policy varchar(40) NOT NULL DEFAULT 'ACCOUNT_DISPLAY_NAME_V1' CHECK(scope_policy='ACCOUNT_DISPLAY_NAME_V1'),
 expected_profile_revision bigint NOT NULL CHECK(expected_profile_revision>0),executor_policy_revision bigint NOT NULL REFERENCES privacy_redaction_executor_event(revision),executor_role oid NOT NULL,environment_code varchar(40) NOT NULL,configuration_reference varchar(100) NOT NULL,
 creator_id uuid NOT NULL REFERENCES privacy_operator(account_id),session_id uuid NOT NULL,transport varchar(7) NOT NULL CHECK(transport IN('BROWSER','NATIVE')),qualification_revision bigint NOT NULL,security_epoch bigint NOT NULL,credential_generation bigint NOT NULL,session_token_hash bytea NOT NULL CHECK(octet_length(session_token_hash)=32),auth_at timestamptz(3) NOT NULL,approval_expires_at timestamptz(3) NOT NULL,
 review_access_id uuid NOT NULL REFERENCES privacy_review_access(id),approval_audit_id uuid NOT NULL UNIQUE REFERENCES audit_event(id),review_references jsonb NOT NULL CHECK(scoped_redaction_references(review_references)),approval_digest bytea NOT NULL CHECK(octet_length(approval_digest)=32),original_response jsonb NOT NULL,
 created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL,created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),revision bigint NOT NULL DEFAULT 1,state varchar(20) NOT NULL DEFAULT 'APPROVED' CHECK(state IN('APPROVED','INTENT_VERIFIED','APPLIED','CANCELLED','COMPLETED')),
 intent_body bytea NOT NULL CHECK(octet_length(intent_body) BETWEEN 1 AND 16384),intent_plain_digest bytea NOT NULL CHECK(intent_plain_digest=sha256(intent_body)),intent_sha256 varchar(64),intent_bytes integer,intent_key_version varchar(7),
 outcome varchar(10) CHECK(outcome IN('APPLIED','CANCELLED')),resolution_actor uuid REFERENCES privacy_operator(account_id),resolution_audit_id uuid UNIQUE REFERENCES audit_event(id),resolution_from_revision bigint,resolved_at timestamptz(3),resolution_xid xid8,profile_revision_after bigint,field_changed boolean,cancel_digest bytea,cancel_response jsonb,
 completion_body bytea CHECK(octet_length(completion_body) BETWEEN 1 AND 16384),completion_sha256 varchar(64),completion_bytes integer,completion_key_version varchar(7),completed_at timestamptz(3),
 FOREIGN KEY(case_id,organization_id,country) REFERENCES privacy_case(id,organization_id,country),FOREIGN KEY(organization_id,requester_id) REFERENCES business_account(organization_id,id),FOREIGN KEY(session_id,creator_id) REFERENCES application_session_identity(id,account_id),
 UNIQUE(case_id,id),UNIQUE(case_id,generation),CHECK(updated_at>=created_at AND approval_expires_at=least(created_at+interval '60 seconds',auth_at+interval '300 seconds')),
 CHECK((intent_sha256 IS NULL AND intent_bytes IS NULL AND intent_key_version IS NULL) OR(intent_sha256 IS NOT NULL AND intent_sha256~'^[0-9a-f]{64}$' AND intent_bytes IS NOT NULL AND intent_bytes BETWEEN 37 AND 16777344 AND intent_key_version IS NOT NULL AND intent_key_version~'^v[1-9][0-9]{0,5}$')),
 CHECK((state IN('APPROVED','INTENT_VERIFIED') AND outcome IS NULL AND resolution_actor IS NULL AND resolution_audit_id IS NULL AND resolution_from_revision IS NULL AND resolved_at IS NULL AND resolution_xid IS NULL AND profile_revision_after IS NULL AND field_changed IS NULL AND cancel_digest IS NULL AND cancel_response IS NULL AND completion_body IS NULL)
 OR(state IN('APPLIED','CANCELLED','COMPLETED') AND outcome IS NOT NULL AND resolution_actor IS NOT NULL AND resolution_audit_id IS NOT NULL AND resolution_from_revision IS NOT NULL AND resolved_at IS NOT NULL AND resolved_at>=created_at AND resolution_xid IS NOT NULL
 AND((outcome='APPLIED' AND profile_revision_after IS NOT NULL AND field_changed IS NOT NULL AND profile_revision_after=expected_profile_revision+CASE WHEN field_changed THEN 1 ELSE 0 END AND cancel_digest IS NULL AND cancel_response IS NULL)
 OR(outcome='CANCELLED' AND profile_revision_after IS NULL AND field_changed IS NULL AND cancel_digest IS NOT NULL AND octet_length(cancel_digest)=32 AND cancel_response IS NOT NULL)))),
 CHECK((state='APPROVED' AND revision=1 AND intent_sha256 IS NULL) OR(state='INTENT_VERIFIED' AND revision=2 AND intent_sha256 IS NOT NULL) OR(state='APPLIED' AND revision=3 AND outcome='APPLIED' AND intent_sha256 IS NOT NULL AND completion_body IS NOT NULL) OR(state='CANCELLED' AND revision IN(2,3) AND outcome='CANCELLED' AND((intent_sha256 IS NULL AND completion_body IS NULL) OR(intent_sha256 IS NOT NULL AND completion_body IS NOT NULL))) OR(state='COMPLETED' AND revision=4 AND intent_sha256 IS NOT NULL AND completion_body IS NOT NULL)),
 CHECK((state<>'COMPLETED' AND completion_sha256 IS NULL AND completion_bytes IS NULL AND completion_key_version IS NULL AND completed_at IS NULL) OR(state='COMPLETED' AND completion_sha256 IS NOT NULL AND completion_sha256~'^[0-9a-f]{64}$' AND completion_bytes IS NOT NULL AND completion_bytes BETWEEN 37 AND 16777344 AND completion_key_version IS NOT NULL AND completion_key_version~'^v[1-9][0-9]{0,5}$' AND completed_at IS NOT NULL AND completed_at>=resolved_at))
);
CREATE UNIQUE INDEX uq_redaction_pending_case ON privacy_redaction_job(case_id) WHERE state<>'COMPLETED';
CREATE UNIQUE INDEX uq_redaction_pending_requester ON privacy_redaction_job(requester_id) WHERE state<>'COMPLETED';
CREATE TABLE privacy_redaction_event(job_id uuid NOT NULL REFERENCES privacy_redaction_job(id),revision bigint NOT NULL,state varchar(20) NOT NULL,outcome varchar(10),occurred_at timestamptz(3) NOT NULL,database_login name NOT NULL,effective_role name NOT NULL,PRIMARY KEY(job_id,revision));
CREATE TABLE privacy_redaction_progress(case_id uuid PRIMARY KEY REFERENCES privacy_case(id),latest_job uuid NOT NULL,revision bigint NOT NULL CHECK(revision>1),FOREIGN KEY(case_id,latest_job) REFERENCES privacy_redaction_job(case_id,id));
CREATE VIEW privacy_redaction_fulfillment_metadata AS SELECT case_id,revision,'REVIEWING'::text AS state FROM privacy_redaction_progress;
CREATE VIEW privacy_redaction_metadata AS SELECT id,case_id,organization_id,country,scope_policy,revision,state,outcome,field_changed,created_at,approval_expires_at,resolved_at,completed_at,original_response,cancel_response,resolution_from_revision FROM privacy_redaction_job;
CREATE VIEW privacy_redaction_worker_work AS SELECT id,case_id,organization_id,country,requester_id,generation,scope_policy,expected_profile_revision,executor_policy_revision,environment_code,configuration_reference,revision,state,outcome,created_at,approval_expires_at,intent_body,intent_sha256,intent_bytes,intent_key_version,completion_sha256,completion_bytes,completion_key_version,
 CASE WHEN resolution_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() THEN completion_body ELSE NULL END AS completion_body
 FROM privacy_redaction_job WHERE executor_role=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned();

CREATE FUNCTION protect_scoped_redaction_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_job'::regclass OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Original scoped redaction retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_xid<>pg_current_xact_id() OR NEW.revision<>1 OR NEW.state<>'APPROVED' OR NEW.created_at<>NEW.updated_at OR NEW.intent_body IS DISTINCT FROM public.scoped_redaction_intent(NEW.id,NEW.case_id,NEW.generation,NEW.organization_id,NEW.country,NEW.requester_id,NEW.expected_profile_revision,NEW.creator_id,NEW.qualification_revision,NEW.review_access_id,NEW.approval_audit_id,NEW.created_at,NEW.review_references)
  OR NOT EXISTS(SELECT 1 FROM public.privacy_case c JOIN public.privacy_review_access p ON p.case_id=c.id JOIN public.audit_event e ON e.id=NEW.approval_audit_id WHERE c.id=NEW.case_id AND c.kind='REDACTION' AND(c.organization_id,c.country,c.requester_id)=(NEW.organization_id,NEW.country,NEW.requester_id) AND p.id=NEW.review_access_id AND p.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND(p.actor_id,p.session_id,p.transport,p.qualification_revision,p.security_epoch,p.credential_generation,p.session_token_hash)=(NEW.creator_id,NEW.session_id,NEW.transport,NEW.qualification_revision,NEW.security_epoch,NEW.credential_generation,NEW.session_token_hash) AND e.actor_id=NEW.creator_id AND e.action='PRIVACY_REDACTION_APPROVED' AND e.resource_id=NEW.id AND e.target_organization_id=NEW.organization_id AND e.target_country=NEW.country AND e.occurred_at=NEW.created_at)
  OR NOT EXISTS(SELECT 1 FROM public.privacy_redaction_executor_event p WHERE(p.revision,p.role_oid,p.environment_code,p.configuration_reference)=(NEW.executor_policy_revision,NEW.executor_role,NEW.environment_code,NEW.configuration_reference) AND p.enabled) THEN RAISE EXCEPTION 'Actual scoped approval source required';END IF;RETURN NEW;
 END IF;
 IF NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Scoped action advances once';END IF;
 IF OLD.intent_sha256 IS NULL AND NEW.intent_sha256 IS NOT NULL AND((OLD.state='APPROVED' AND NEW.state='INTENT_VERIFIED') OR(OLD.state='CANCELLED' AND NEW.state='CANCELLED')) AND OLD.executor_role=public.scoped_redaction_caller()
 AND(to_jsonb(NEW)-ARRAY['revision','updated_at','state','intent_sha256','intent_bytes','intent_key_version','completion_body'])=(to_jsonb(OLD)-ARRAY['revision','updated_at','state','intent_sha256','intent_bytes','intent_key_version','completion_body']) THEN RETURN NEW;END IF;
 IF OLD.state IN('APPROVED','INTENT_VERIFIED') AND NEW.state='CANCELLED' AND NEW.outcome='CANCELLED' AND NEW.resolution_from_revision=OLD.revision AND NEW.resolution_xid=pg_current_xact_id()
 AND(to_jsonb(NEW)-ARRAY['revision','updated_at','state','outcome','resolution_actor','resolution_audit_id','resolution_from_revision','resolved_at','resolution_xid','cancel_digest','cancel_response','completion_body'])=(to_jsonb(OLD)-ARRAY['revision','updated_at','state','outcome','resolution_actor','resolution_audit_id','resolution_from_revision','resolved_at','resolution_xid','cancel_digest','cancel_response','completion_body'])
 AND EXISTS(SELECT 1 FROM public.audit_event e WHERE e.id=NEW.resolution_audit_id AND e.actor_id=NEW.resolution_actor AND e.action='PRIVACY_REDACTION_CANCELLED' AND e.resource_id=NEW.id AND e.occurred_at=NEW.resolved_at AND e.target_organization_id=NEW.organization_id AND e.target_country=NEW.country) THEN RETURN NEW;END IF;
 IF OLD.state='INTENT_VERIFIED' AND NEW.state='APPLIED' AND NEW.outcome='APPLIED' AND OLD.executor_role=public.scoped_redaction_caller() AND NEW.resolution_from_revision=OLD.revision AND NEW.resolution_xid=pg_current_xact_id() AND NEW.resolution_actor=OLD.creator_id
 AND(to_jsonb(NEW)-ARRAY['revision','updated_at','state','outcome','resolution_actor','resolution_audit_id','resolution_from_revision','resolved_at','resolution_xid','profile_revision_after','field_changed','completion_body'])=(to_jsonb(OLD)-ARRAY['revision','updated_at','state','outcome','resolution_actor','resolution_audit_id','resolution_from_revision','resolved_at','resolution_xid','profile_revision_after','field_changed','completion_body'])
 AND EXISTS(SELECT 1 FROM public.account_identity a JOIN public.audit_event e ON e.id=NEW.resolution_audit_id WHERE a.id=OLD.requester_id AND a.display_name='[redacted]' AND a.revision=NEW.profile_revision_after AND e.actor_id=NEW.creator_id AND e.action='PRIVACY_REDACTION_APPLIED' AND e.resource_id=NEW.id AND e.occurred_at=NEW.resolved_at AND e.target_organization_id=NEW.organization_id AND e.target_country=NEW.country) THEN RETURN NEW;END IF;
 IF OLD.state IN('APPLIED','CANCELLED') AND NEW.state='COMPLETED' AND OLD.executor_role=public.scoped_redaction_caller() AND OLD.resolution_xid IS DISTINCT FROM pg_current_xact_id_if_assigned()
 AND(to_jsonb(NEW)-ARRAY['revision','updated_at','state','completion_sha256','completion_bytes','completion_key_version','completed_at'])=(to_jsonb(OLD)-ARRAY['revision','updated_at','state','completion_sha256','completion_bytes','completion_key_version','completed_at']) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Invalid scoped redaction transition';
END $$;
REVOKE ALL ON FUNCTION protect_scoped_redaction_job() FROM PUBLIC;
CREATE TRIGGER tr_scoped_redaction_job BEFORE INSERT OR UPDATE OR DELETE ON privacy_redaction_job FOR EACH ROW EXECUTE FUNCTION protect_scoped_redaction_job();
CREATE FUNCTION record_scoped_redaction_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_job'::regclass THEN RAISE EXCEPTION 'Original scoped job source required';END IF;
 INSERT INTO public.privacy_redaction_event VALUES(NEW.id,NEW.revision,NEW.state,NEW.outcome,NEW.updated_at,session_user,CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END);
 INSERT INTO public.privacy_redaction_progress(case_id,latest_job,revision) SELECT NEW.case_id,(SELECT id FROM public.privacy_redaction_job WHERE case_id=NEW.case_id ORDER BY generation DESC LIMIT 1),(SELECT 1+sum(revision) FROM public.privacy_redaction_job WHERE case_id=NEW.case_id)
 ON CONFLICT(case_id) DO UPDATE SET latest_job=EXCLUDED.latest_job,revision=EXCLUDED.revision;RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION record_scoped_redaction_job() FROM PUBLIC;
CREATE TRIGGER tr_scoped_redaction_record AFTER INSERT OR UPDATE ON privacy_redaction_job FOR EACH ROW EXECUTE FUNCTION record_scoped_redaction_job();
CREATE FUNCTION protect_scoped_redaction_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_event'::regclass OR pg_trigger_depth()<2 OR NEW.database_login<>session_user OR NEW.effective_role<>(CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END) OR NOT EXISTS(SELECT 1 FROM public.privacy_redaction_job p WHERE(p.id,p.revision,p.state,p.updated_at)=(NEW.job_id,NEW.revision,NEW.state,NEW.occurred_at) AND p.outcome IS NOT DISTINCT FROM NEW.outcome) THEN RAISE EXCEPTION 'Derived scoped event required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_scoped_redaction_event() FROM PUBLIC;
CREATE TRIGGER tr_scoped_redaction_event_source BEFORE INSERT ON privacy_redaction_event FOR EACH ROW EXECUTE FUNCTION protect_scoped_redaction_event();
CREATE FUNCTION protect_scoped_redaction_progress() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_progress'::regclass OR TG_OP='DELETE' OR pg_trigger_depth()<2 OR NEW.revision IS DISTINCT FROM(SELECT 1+sum(revision) FROM public.privacy_redaction_job WHERE case_id=NEW.case_id) OR NEW.latest_job IS DISTINCT FROM(SELECT id FROM public.privacy_redaction_job WHERE case_id=NEW.case_id ORDER BY generation DESC LIMIT 1) THEN RAISE EXCEPTION 'Derived scoped progress required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_scoped_redaction_progress() FROM PUBLIC;
CREATE TRIGGER tr_scoped_redaction_progress BEFORE INSERT OR UPDATE OR DELETE ON privacy_redaction_progress FOR EACH ROW EXECUTE FUNCTION protect_scoped_redaction_progress();
CREATE TRIGGER tr_scoped_redaction_event_retained BEFORE UPDATE OR DELETE ON privacy_redaction_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_scoped_redaction_job_no_truncate BEFORE TRUNCATE ON privacy_redaction_job FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_scoped_redaction_event_no_truncate BEFORE TRUNCATE ON privacy_redaction_event FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_scoped_redaction_progress_no_truncate BEFORE TRUNCATE ON privacy_redaction_progress FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();

CREATE FUNCTION prepare_scoped_redaction(p_plan uuid,p_access uuid,p_nonce bytea,p_actor uuid,p_session uuid,p_transport text,p_expected_revision bigint,p_refs jsonb,p_digest bytea,p_original jsonb,p_audit uuid,p_request uuid,p_at timestamptz)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c record;previous public.privacy_redaction_job%ROWTYPE;policy public.privacy_redaction_executor%ROWTYPE;subject public.account_identity%ROWTYPE;membership public.business_account%ROWTYPE;proof public.privacy_review_access%ROWTYPE;authentication public.application_session%ROWTYPE;counter bigint;sequence integer;body bytea;
BEGIN
 SELECT r.id,r.organization_id,r.country,r.requester_id,r.kind INTO c FROM public.read_privacy_review(p_access,p_nonce,p_actor,p_session,p_transport,p_at) r;
 IF NOT FOUND OR c.kind<>'REDACTION' THEN RETURN 'NOT_FOUND';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('scoped-redaction/'||p_plan::text,0));
 SELECT * INTO previous FROM public.privacy_redaction_job WHERE id=p_plan FOR UPDATE;
 IF FOUND THEN
  IF(previous.case_id,previous.creator_id) IS DISTINCT FROM(c.id,p_actor) THEN RETURN 'NOT_FOUND';END IF;
  IF previous.approval_digest IS DISTINCT FROM p_digest THEN RETURN 'IDEMPOTENCY_MISMATCH';END IF;
  IF p_at>=previous.created_at+interval '7 days' THEN RETURN 'REPLAY_EXPIRED';END IF;RETURN 'REPLAY';
 END IF;
 PERFORM id FROM public.privacy_redaction_job WHERE case_id=c.id ORDER BY generation FOR UPDATE;
 SELECT coalesce((SELECT revision FROM public.privacy_redaction_progress WHERE case_id=c.id),1) INTO counter;
 IF counter<>p_expected_revision THEN RETURN 'REVISION_MISMATCH';END IF;
 SELECT * INTO subject FROM public.account_identity WHERE id=c.requester_id;
 SELECT * INTO membership FROM public.business_account WHERE id=c.requester_id AND organization_id=c.organization_id;
 IF membership.id IS NULL THEN RETURN 'NOT_FOUND';END IF;
 IF membership.role='OWNER' THEN RETURN 'OWNER_PROTECTED';END IF;
 IF subject.credential_operation_pending THEN RETURN 'CREDENTIAL_RECONCILIATION_REQUIRED';END IF;
 IF subject.state<>'DEACTIVATED' OR EXISTS(SELECT 1 FROM public.application_session s WHERE s.account_id=subject.id AND s.token_hash IS NOT NULL AND s.revoked_at IS NULL AND s.security_epoch=subject.security_epoch AND s.credential_generation=subject.credential_generation AND p_at<s.absolute_expires_at AND p_at<s.last_qualified_activity_at+interval '7 days') THEN RETURN 'SUBJECT_NOT_CONTAINED';END IF;
 IF public.retention_preservation_active() THEN RETURN 'HOLD_ACTIVE';END IF;
 IF EXISTS(SELECT 1 FROM public.privacy_redaction_job WHERE requester_id=subject.id AND state<>'COMPLETED') THEN RETURN 'WORK_PENDING';END IF;
 SELECT * INTO policy FROM public.privacy_redaction_executor WHERE id=1 AND enabled AND updated_at<=p_at FOR SHARE;IF NOT FOUND THEN RETURN 'SERVICE_UNAVAILABLE';END IF;
 SELECT * INTO proof FROM public.privacy_review_access WHERE id=p_access;
 SELECT * INTO authentication FROM public.application_session WHERE id=p_session;
 IF NOT coalesce(public.scoped_redaction_references(p_refs),false) THEN RETURN 'INVALID_REFERENCE';END IF;
 SELECT coalesce(max(generation),0)+1 INTO sequence FROM public.privacy_redaction_job WHERE case_id=c.id;
 body:=public.scoped_redaction_intent(p_plan,c.id,sequence,c.organization_id,c.country,c.requester_id,subject.revision,p_actor,proof.qualification_revision,p_access,p_audit,p_at,p_refs);
 INSERT INTO public.audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,reason,changed_fields,target_organization_id,target_country)
 VALUES(p_audit,'PLATFORM_ADMIN',p_actor,'PRIVACY_REDACTION_APPROVED','PRIVACY_REDACTION',p_plan,'SUCCESS',p_request,p_at,proof.reason,ARRAY['scopedRedaction'],c.organization_id,c.country);
 INSERT INTO public.privacy_redaction_job(id,case_id,organization_id,country,requester_id,generation,expected_profile_revision,executor_policy_revision,executor_role,environment_code,configuration_reference,creator_id,session_id,transport,qualification_revision,security_epoch,credential_generation,session_token_hash,auth_at,approval_expires_at,review_access_id,approval_audit_id,review_references,approval_digest,original_response,created_at,updated_at,intent_body,intent_plain_digest)
 VALUES(p_plan,c.id,c.organization_id,c.country,c.requester_id,sequence,subject.revision,policy.revision,policy.role_oid,policy.environment_code,policy.configuration_reference,p_actor,p_session,p_transport,proof.qualification_revision,proof.security_epoch,proof.credential_generation,proof.session_token_hash,authentication.auth_at,least(p_at+interval '60 seconds',authentication.auth_at+interval '300 seconds'),p_access,p_audit,p_refs,p_digest,p_original,p_at,p_at,body,sha256(body));RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION prepare_scoped_redaction(uuid,uuid,bytea,uuid,uuid,text,bigint,jsonb,bytea,jsonb,uuid,uuid,timestamptz) FROM PUBLIC;

CREATE FUNCTION acknowledge_scoped_redaction(p_plan uuid,p_kind text,p_digest text,p_bytes integer,p_key_version text,p_at timestamptz)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ DECLARE job public.privacy_redaction_job%ROWTYPE;body bytea;BEGIN
 SELECT * INTO job FROM public.privacy_redaction_job WHERE id=p_plan AND executor_role=public.scoped_redaction_caller() AND created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() FOR UPDATE;
 IF NOT FOUND THEN RETURN 'NOT_FOUND';END IF;
 IF p_digest IS NULL OR p_digest!~'^[0-9a-f]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 37 AND 16777344 OR p_key_version IS NULL OR p_key_version!~'^v[1-9][0-9]{0,5}$' THEN RETURN 'EVIDENCE_CONFLICT';END IF;
 IF p_kind='INTENT' THEN
  IF job.intent_sha256 IS NOT NULL THEN IF(job.intent_sha256,job.intent_bytes,job.intent_key_version) IS NOT DISTINCT FROM(p_digest,p_bytes,p_key_version) THEN RETURN 'OK';ELSE RETURN 'EVIDENCE_CONFLICT';END IF;END IF;
  IF job.state NOT IN('APPROVED','CANCELLED') THEN RETURN 'INVALID_STATE';END IF;
  IF job.state='CANCELLED' THEN body:=public.scoped_redaction_completion(job.id,job.case_id,job.generation,job.organization_id,job.country,job.resolution_actor,job.resolution_audit_id,job.outcome,job.resolved_at,job.profile_revision_after,job.field_changed,p_digest);END IF;
  UPDATE public.privacy_redaction_job SET state=CASE WHEN state='APPROVED' THEN 'INTENT_VERIFIED' ELSE state END,revision=revision+1,updated_at=p_at,intent_sha256=p_digest,intent_bytes=p_bytes,intent_key_version=p_key_version,completion_body=body WHERE id=p_plan;RETURN 'OK';
 ELSIF p_kind='COMPLETION' THEN
  IF job.state='COMPLETED' THEN IF(job.completion_sha256,job.completion_bytes,job.completion_key_version) IS NOT DISTINCT FROM(p_digest,p_bytes,p_key_version) THEN RETURN 'OK';ELSE RETURN 'EVIDENCE_CONFLICT';END IF;END IF;
  IF job.state NOT IN('APPLIED','CANCELLED') OR job.completion_body IS NULL OR job.resolution_xid IS NOT DISTINCT FROM pg_current_xact_id_if_assigned() THEN RETURN 'SOURCE_NOT_COMMITTED';END IF;
  UPDATE public.privacy_redaction_job SET state='COMPLETED',revision=revision+1,updated_at=p_at,completion_sha256=p_digest,completion_bytes=p_bytes,completion_key_version=p_key_version,completed_at=p_at WHERE id=p_plan;RETURN 'OK';
 END IF;RETURN 'INVALID_STATE';
END $$;
REVOKE ALL ON FUNCTION acknowledge_scoped_redaction(uuid,text,text,integer,text,timestamptz) FROM PUBLIC;

CREATE FUNCTION apply_scoped_redaction(p_plan uuid,p_audit uuid,p_request uuid,p_at timestamptz)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE job public.privacy_redaction_job%ROWTYPE;subject public.account_identity%ROWTYPE;membership public.business_account%ROWTYPE;changed boolean;after_revision bigint;affected integer;body bytea;
BEGIN
 SELECT * INTO job FROM public.privacy_redaction_job WHERE id=p_plan AND executor_role=public.scoped_redaction_caller() AND created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned();IF NOT FOUND THEN RETURN 'NOT_FOUND';END IF;
 IF job.state IN('APPLIED','CANCELLED','COMPLETED') THEN RETURN 'RESOLVED';END IF;
 PERFORM id FROM public.organization WHERE id=job.organization_id FOR UPDATE;
 PERFORM id FROM public.account_identity WHERE id IN(job.creator_id,job.requester_id) ORDER BY id FOR UPDATE;
 PERFORM id FROM public.application_session WHERE id=job.session_id FOR UPDATE;
 PERFORM account_id FROM public.privacy_operator WHERE account_id=job.creator_id FOR SHARE;
 IF public.retention_preservation_active() THEN RETURN 'HOLD_ACTIVE';END IF;
 SELECT * INTO job FROM public.privacy_redaction_job WHERE id=p_plan FOR UPDATE;
 IF job.state IN('APPLIED','CANCELLED','COMPLETED') THEN RETURN 'RESOLVED';END IF;
 IF job.state<>'INTENT_VERIFIED' THEN RETURN 'INTENT_NOT_VERIFIED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.privacy_redaction_executor p WHERE p.id=1 AND p.enabled AND p.revision=job.executor_policy_revision AND p.role_oid=job.executor_role FOR SHARE) THEN RETURN 'EXECUTOR_POLICY_CHANGED';END IF;
 IF p_at<job.created_at OR p_at>=job.approval_expires_at THEN RETURN 'AUTHORIZATION_EXPIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.privacy_operator q JOIN public.account_identity a ON a.id=q.account_id JOIN public.application_session s ON s.account_id=a.id WHERE a.id=job.creator_id AND s.id=job.session_id AND q.enabled AND q.revision=job.qualification_revision AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending AND(a.security_epoch,a.credential_generation)=(job.security_epoch,job.credential_generation) AND(s.security_epoch,s.credential_generation)=(job.security_epoch,job.credential_generation) AND s.transport=job.transport AND s.token_hash=job.session_token_hash AND s.revoked_at IS NULL AND s.auth_at<=p_at AND p_at<s.auth_at+interval '300 seconds' AND p_at<s.absolute_expires_at AND p_at<s.last_qualified_activity_at+interval '30 minutes') THEN RETURN 'AUTHORITY_CHANGED';END IF;
 SELECT * INTO subject FROM public.account_identity WHERE id=job.requester_id;
 SELECT * INTO membership FROM public.business_account WHERE id=job.requester_id AND organization_id=job.organization_id;
 IF membership.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.organization WHERE id=job.organization_id AND country=job.country) THEN RETURN 'NOT_FOUND';END IF;
 IF membership.role='OWNER' THEN RETURN 'OWNER_PROTECTED';END IF;
 IF subject.credential_operation_pending THEN RETURN 'CREDENTIAL_RECONCILIATION_REQUIRED';END IF;
 IF subject.state<>'DEACTIVATED' OR EXISTS(SELECT 1 FROM public.application_session s WHERE s.account_id=subject.id AND s.token_hash IS NOT NULL AND s.revoked_at IS NULL AND s.security_epoch=subject.security_epoch AND s.credential_generation=subject.credential_generation AND p_at<s.absolute_expires_at AND p_at<s.last_qualified_activity_at+interval '7 days') THEN RETURN 'SUBJECT_NOT_CONTAINED';END IF;
 IF subject.revision<>job.expected_profile_revision OR p_at<subject.updated_at THEN RETURN 'STALE_PLAN';END IF;
 UPDATE public.account_identity SET display_name='[redacted]',revision=revision+1,updated_at=p_at WHERE id=job.requester_id AND display_name IS DISTINCT FROM '[redacted]';GET DIAGNOSTICS affected=ROW_COUNT;changed:=affected=1;after_revision:=subject.revision+affected;
 INSERT INTO public.audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,target_organization_id,target_country)
 VALUES(p_audit,'PLATFORM_ADMIN',job.creator_id,'PRIVACY_REDACTION_APPLIED','PRIVACY_REDACTION',job.id,'SUCCESS',p_request,p_at,ARRAY['scopedRedaction'],job.organization_id,job.country);
 body:=public.scoped_redaction_completion(job.id,job.case_id,job.generation,job.organization_id,job.country,job.creator_id,p_audit,'APPLIED',p_at,after_revision,changed,job.intent_sha256);
 UPDATE public.privacy_redaction_job SET state='APPLIED',revision=revision+1,updated_at=p_at,outcome='APPLIED',resolution_actor=creator_id,resolution_audit_id=p_audit,resolution_from_revision=revision,resolved_at=p_at,resolution_xid=pg_current_xact_id(),profile_revision_after=after_revision,field_changed=changed,completion_body=body WHERE id=p_plan;RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION apply_scoped_redaction(uuid,uuid,uuid,timestamptz) FROM PUBLIC;

CREATE FUNCTION cancel_scoped_redaction(p_plan uuid,p_access uuid,p_nonce bytea,p_actor uuid,p_session uuid,p_transport text,p_expected_revision bigint,p_digest bytea,p_response jsonb,p_audit uuid,p_request uuid,p_at timestamptz)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ DECLARE c record;job public.privacy_redaction_job%ROWTYPE;reason text;body bytea;BEGIN
 SELECT r.id,r.organization_id,r.country,r.kind INTO c FROM public.read_privacy_review(p_access,p_nonce,p_actor,p_session,p_transport,p_at) r;IF NOT FOUND OR c.kind<>'REDACTION' THEN RETURN 'NOT_FOUND';END IF;
 SELECT * INTO job FROM public.privacy_redaction_job WHERE id=p_plan AND case_id=c.id FOR UPDATE;IF NOT FOUND THEN RETURN 'NOT_FOUND';END IF;
 IF job.outcome='CANCELLED' THEN
  IF job.resolution_actor<>p_actor THEN RETURN 'REVISION_MISMATCH';END IF;
  IF job.cancel_digest IS DISTINCT FROM p_digest THEN RETURN 'IDEMPOTENCY_MISMATCH';END IF;
  IF p_at>=job.resolved_at+interval '7 days' THEN RETURN 'REPLAY_EXPIRED';END IF;RETURN 'REPLAY';
 END IF;
 IF job.revision<>p_expected_revision THEN RETURN 'REVISION_MISMATCH';END IF;
 IF job.state NOT IN('APPROVED','INTENT_VERIFIED') THEN RETURN 'INVALID_STATE';END IF;
 SELECT p.reason INTO reason FROM public.privacy_review_access p WHERE p.id=p_access;
 INSERT INTO public.audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,reason,changed_fields,target_organization_id,target_country)
 VALUES(p_audit,'PLATFORM_ADMIN',p_actor,'PRIVACY_REDACTION_CANCELLED','PRIVACY_REDACTION',job.id,'SUCCESS',p_request,p_at,reason,ARRAY['scopedRedaction'],job.organization_id,job.country);
 IF job.intent_sha256 IS NOT NULL THEN body:=public.scoped_redaction_completion(job.id,job.case_id,job.generation,job.organization_id,job.country,p_actor,p_audit,'CANCELLED',p_at,NULL,NULL,job.intent_sha256);END IF;
 UPDATE public.privacy_redaction_job SET state='CANCELLED',revision=revision+1,updated_at=p_at,outcome='CANCELLED',resolution_actor=p_actor,resolution_audit_id=p_audit,resolution_from_revision=revision,resolved_at=p_at,resolution_xid=pg_current_xact_id(),cancel_digest=p_digest,cancel_response=p_response,completion_body=body WHERE id=p_plan;RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION cancel_scoped_redaction(uuid,uuid,bytea,uuid,uuid,text,bigint,bytea,jsonb,uuid,uuid,timestamptz) FROM PUBLIC;

DO $$ DECLARE previous text;BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR(resource_type=''PRIVACY_REDACTION'' AND actor_type=''PLATFORM_ADMIN'' AND target_organization_id IS NOT NULL AND action IN(''PRIVACY_REDACTION_APPROVED'',''PRIVACY_REDACTION_READ'',''PRIVACY_REDACTION_CANCELLED'',''PRIVACY_REDACTION_APPLIED'')))',previous);
END $$;
UPDATE backend_schema_version SET version=75 WHERE id=1;
