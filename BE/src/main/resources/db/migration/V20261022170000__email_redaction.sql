-- Assisted local email redaction after source-bound read-only managed containment observation.
ALTER TABLE account_identity ADD COLUMN privacy_retired_at timestamptz(3);
ALTER TABLE privacy_redaction_executor ADD COLUMN identity_endpoint varchar(512),ADD COLUMN identity_tenant_id uuid,ADD COLUMN identity_conformance_reference varchar(100),ADD COLUMN identity_absence_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE privacy_redaction_executor_event ADD COLUMN identity_endpoint varchar(512),ADD COLUMN identity_tenant_id uuid,ADD COLUMN identity_conformance_reference varchar(100),ADD COLUMN identity_absence_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE privacy_redaction_executor ADD CONSTRAINT ck_identity_observer_configuration CHECK((identity_endpoint IS NULL AND identity_tenant_id IS NULL AND identity_conformance_reference IS NULL AND NOT identity_absence_allowed) OR(identity_endpoint IS NOT NULL AND identity_endpoint~'^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?/api/login$' AND identity_tenant_id IS NOT NULL AND identity_conformance_reference IS NOT NULL AND identity_conformance_reference~'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$'));
ALTER TABLE privacy_redaction_job DROP CONSTRAINT privacy_redaction_job_scope_policy_check;
ALTER TABLE privacy_redaction_job ADD CONSTRAINT privacy_redaction_job_scope_policy_check CHECK(scope_policy IN('ACCOUNT_DISPLAY_NAME_V1','REQUESTER_NAMES_V1','ACCOUNT_EMAIL_V1'));
ALTER TABLE privacy_redaction_job ADD COLUMN provider_tenant_id uuid,ADD COLUMN provider_user_id uuid,ADD COLUMN provider_endpoint varchar(512),ADD COLUMN provider_conformance_reference varchar(100),ADD COLUMN provider_absence_allowed boolean NOT NULL DEFAULT false,ADD COLUMN identity_observation_id uuid;
ALTER TABLE privacy_redaction_job ADD CONSTRAINT ck_redaction_provider_source CHECK((scope_policy='ACCOUNT_EMAIL_V1' AND provider_tenant_id IS NOT NULL AND provider_user_id IS NOT NULL AND provider_endpoint IS NOT NULL AND provider_conformance_reference IS NOT NULL AND source_manifest='[]'::jsonb) OR(scope_policy<>'ACCOUNT_EMAIL_V1' AND provider_tenant_id IS NULL AND provider_user_id IS NULL AND provider_endpoint IS NULL AND provider_conformance_reference IS NULL AND NOT provider_absence_allowed AND identity_observation_id IS NULL));

CREATE TABLE privacy_identity_observation(
 id uuid PRIMARY KEY CHECK(id::text~'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),job_id uuid NOT NULL REFERENCES privacy_redaction_job(id),
 tenant_id uuid NOT NULL,provider_user_id uuid NOT NULL,endpoint varchar(512) NOT NULL,conformance_reference varchar(100) NOT NULL,absence_allowed boolean NOT NULL,
 state varchar(32) NOT NULL CHECK(state IN('INACTIVE','ABSENT_IN_CONFIRMED_TENANT')),observed_at timestamptz(3) NOT NULL,recorded_at timestamptz(3) NOT NULL CHECK(recorded_at>=observed_at AND recorded_at<observed_at+interval '15 seconds'),created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),database_login name NOT NULL,effective_role name NOT NULL,UNIQUE(job_id,id));
ALTER TABLE privacy_redaction_job ADD FOREIGN KEY(id,identity_observation_id) REFERENCES privacy_identity_observation(job_id,id);
ALTER TABLE privacy_redaction_apply_source ADD COLUMN identity_observation_id uuid;
ALTER TABLE privacy_redaction_apply_source ADD FOREIGN KEY(job_id,identity_observation_id) REFERENCES privacy_identity_observation(job_id,id);
CREATE FUNCTION guard_identity_observation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_identity_observation'::regclass OR TG_OP<>'INSERT' OR NEW.created_xid<>pg_current_xact_id() OR NEW.database_login<>session_user OR NEW.effective_role<>(CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END) OR NOT EXISTS(SELECT 1 FROM public.privacy_redaction_job j WHERE j.id=NEW.job_id AND j.scope_policy='ACCOUNT_EMAIL_V1' AND j.state='INTENT_VERIFIED' AND j.executor_role=public.scoped_redaction_caller() AND j.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND NEW.observed_at>=j.created_at AND NEW.recorded_at<j.approval_expires_at AND(NEW.tenant_id,NEW.provider_user_id,NEW.endpoint,NEW.conformance_reference,NEW.absence_allowed)=(j.provider_tenant_id,j.provider_user_id,j.provider_endpoint,j.provider_conformance_reference,j.provider_absence_allowed) AND(NEW.state='INACTIVE' OR j.provider_absence_allowed)) THEN RAISE EXCEPTION 'Actual source-bound identity observation required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_identity_observation() FROM PUBLIC;
CREATE TRIGGER tr_identity_observation BEFORE INSERT OR UPDATE OR DELETE ON privacy_identity_observation FOR EACH ROW EXECUTE FUNCTION guard_identity_observation();
CREATE TRIGGER tr_identity_observation_no_truncate BEFORE TRUNCATE ON privacy_identity_observation FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();

CREATE FUNCTION acknowledge_identity_containment(p_id uuid,p_job uuid,p_state text,p_observed timestamptz,p_at timestamptz) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$ DECLARE j public.privacy_redaction_job%ROWTYPE;previous public.privacy_identity_observation%ROWTYPE;BEGIN
 SELECT * INTO j FROM public.privacy_redaction_job WHERE id=p_job AND scope_policy='ACCOUNT_EMAIL_V1' AND executor_role=public.scoped_redaction_caller() AND created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() FOR UPDATE;IF NOT FOUND THEN RETURN 'NOT_FOUND';END IF;
 SELECT * INTO previous FROM public.privacy_identity_observation WHERE id=p_id;IF FOUND THEN IF(previous.job_id,previous.state,previous.observed_at) IS NOT DISTINCT FROM(p_job,p_state,p_observed) THEN RETURN 'OK';ELSE RETURN 'EVIDENCE_CONFLICT';END IF;END IF;
 IF j.state IN('APPLIED','CANCELLED','COMPLETED') THEN RETURN 'RESOLVED';END IF;
 IF j.state<>'INTENT_VERIFIED' OR p_at>=j.approval_expires_at THEN RETURN 'AUTHORIZATION_EXPIRED';END IF;
 IF p_observed IS NULL OR p_observed<j.created_at OR p_at<p_observed OR p_at>=p_observed+interval '15 seconds' OR p_state IS NULL OR NOT(p_state='INACTIVE' OR(p_state='ABSENT_IN_CONFIRMED_TENANT' AND j.provider_absence_allowed)) THEN RETURN 'IDENTITY_CONTAINMENT_UNVERIFIED';END IF;
 INSERT INTO public.privacy_identity_observation(id,job_id,tenant_id,provider_user_id,endpoint,conformance_reference,absence_allowed,state,observed_at,recorded_at,database_login,effective_role) VALUES(p_id,j.id,j.provider_tenant_id,j.provider_user_id,j.provider_endpoint,j.provider_conformance_reference,j.provider_absence_allowed,p_state,p_observed,p_at,session_user,CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END);RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION acknowledge_identity_containment(uuid,uuid,text,timestamptz,timestamptz) FROM PUBLIC;
CREATE FUNCTION retired_account_email(account uuid) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'retired+'||account::text||'@accounts.invalid' $$;


CREATE OR REPLACE FUNCTION protect_redaction_executor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_executor'::regclass OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Original redaction executor history required';END IF;
 IF TG_OP='INSERT' THEN IF NEW.revision<>1 OR NEW.created_at<>NEW.updated_at THEN RAISE EXCEPTION 'Initial executor policy required';END IF;
 ELSIF NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at OR(NEW.role_oid,NEW.environment_code,NEW.enabled,NEW.configuration_reference,NEW.identity_endpoint,NEW.identity_tenant_id,NEW.identity_conformance_reference,NEW.identity_absence_allowed) IS NOT DISTINCT FROM(OLD.role_oid,OLD.environment_code,OLD.enabled,OLD.configuration_reference,OLD.identity_endpoint,OLD.identity_tenant_id,OLD.identity_conformance_reference,OLD.identity_absence_allowed) THEN RAISE EXCEPTION 'Versioned executor policy change required';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.oid=NEW.role_oid AND NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication) AND NOT has_schema_privilege(r.oid,'public','CREATE')) THEN RAISE EXCEPTION 'Restricted executor role required';END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION record_redaction_executor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_executor'::regclass THEN RAISE EXCEPTION 'Original executor policy required';END IF;
 INSERT INTO public.privacy_redaction_executor_event VALUES(NEW.revision,NEW.role_oid,NEW.environment_code,NEW.enabled,NEW.configuration_reference,NEW.updated_at,session_user,CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END,NEW.identity_endpoint,NEW.identity_tenant_id,NEW.identity_conformance_reference,NEW.identity_absence_allowed);RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION protect_redaction_executor_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_executor_event'::regclass OR pg_trigger_depth()<2 OR NEW.database_login<>session_user OR NEW.effective_role<>(CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END) OR NOT EXISTS(SELECT 1 FROM public.privacy_redaction_executor p WHERE(p.revision,p.role_oid,p.environment_code,p.enabled,p.configuration_reference,p.updated_at)=(NEW.revision,NEW.role_oid,NEW.environment_code,NEW.enabled,NEW.configuration_reference,NEW.occurred_at) AND(p.identity_endpoint,p.identity_tenant_id,p.identity_conformance_reference,p.identity_absence_allowed) IS NOT DISTINCT FROM(NEW.identity_endpoint,NEW.identity_tenant_id,NEW.identity_conformance_reference,NEW.identity_absence_allowed)) THEN RAISE EXCEPTION 'Derived executor policy evidence required';END IF;RETURN NEW;
END $$;

CREATE FUNCTION permitted_retired_email_projection(before_row jsonb,after_row jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$ DECLARE source record;expected jsonb;retired_time jsonb;BEGIN
 SELECT j.requester_id,j.expected_profile_revision,s.occurred_at INTO source FROM public.privacy_redaction_apply_source s JOIN public.privacy_redaction_job j ON j.id=s.job_id JOIN public.privacy_identity_observation o ON o.id=s.identity_observation_id AND o.job_id=j.id WHERE s.source_xid=pg_current_xact_id_if_assigned() AND j.scope_policy='ACCOUNT_EMAIL_V1' AND j.state='INTENT_VERIFIED' AND j.executor_role=public.scoped_redaction_caller() AND o.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND o.observed_at<=s.occurred_at AND s.occurred_at<o.observed_at+interval '15 seconds';IF NOT FOUND THEN RETURN false;END IF;
 IF before_row->>'id' IS DISTINCT FROM source.requester_id::text OR before_row->>'kind' IS DISTINCT FROM 'BUSINESS' OR before_row->>'state' IS DISTINCT FROM 'DEACTIVATED' OR(before_row->>'credential_operation_pending')::boolean OR(before_row->>'revision')::bigint<>source.expected_profile_revision THEN RETURN false;END IF;
 retired_time:=CASE WHEN before_row->'privacy_retired_at'='null'::jsonb THEN to_jsonb(source.occurred_at) ELSE before_row->'privacy_retired_at' END;
 expected:=before_row||jsonb_build_object('email',public.retired_account_email(source.requester_id),'email_verified',false,'privacy_retired_at',retired_time,'security_epoch',(before_row->>'security_epoch')::bigint+1,'credential_generation',(before_row->>'credential_generation')::bigint+1,'revision',(before_row->>'revision')::bigint+1,'updated_at',source.occurred_at);
 RETURN after_row=expected;
END $$;
REVOKE ALL ON FUNCTION permitted_retired_email_projection(jsonb,jsonb) FROM PUBLIC;
CREATE FUNCTION protect_privacy_retired_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$ BEGIN
 IF TG_RELID<>'public.account_identity'::regclass THEN RAISE EXCEPTION 'Original account source required';END IF;
 IF TG_OP='INSERT' THEN IF NEW.privacy_retired_at IS NOT NULL THEN RAISE EXCEPTION 'Account retirement requires reviewed existing source';END IF;RETURN NEW;END IF;
 IF OLD.privacy_retired_at IS NOT NULL THEN
  IF NEW.privacy_retired_at IS DISTINCT FROM OLD.privacy_retired_at OR NEW.email IS DISTINCT FROM OLD.email OR NEW.email_verified OR NEW.state<>'DEACTIVATED' THEN RAISE EXCEPTION 'Retired identity remains contained';END IF;
 ELSIF NEW.privacy_retired_at IS NOT NULL AND NOT public.permitted_retired_email_projection(to_jsonb(OLD),to_jsonb(NEW)) THEN RAISE EXCEPTION 'Retirement requires guarded source and observed containment';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_privacy_retired_identity() FROM PUBLIC;
CREATE TRIGGER tr_privacy_retired_identity BEFORE INSERT OR UPDATE ON account_identity FOR EACH ROW EXECUTE FUNCTION protect_privacy_retired_identity();

CREATE OR REPLACE FUNCTION coordinate_account_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$
DECLARE claim login_email_claim%ROWTYPE; value text;
BEGIN
    IF TG_RELID<>'public.account_identity'::regclass OR TG_OP NOT IN('INSERT','UPDATE') THEN RAISE EXCEPTION 'Original account email source required';END IF;
    IF TG_OP='INSERT' THEN
        PERFORM lock_login_email(NEW.email);
        -- A setup cannot take a live reservation; expiry cleanup happens through the controlled claim workflow.
        INSERT INTO login_email_claim(email,account_id,kind) VALUES (NEW.email,NEW.id,'CURRENT');
        RETURN NEW;
    END IF;
    IF NEW.email=OLD.email THEN RETURN NEW; END IF;
    IF public.permitted_retired_email_projection(to_jsonb(OLD),to_jsonb(NEW)) THEN
        INSERT INTO public.login_email_claim(email,account_id,kind) VALUES(NEW.email,NEW.id,'CURRENT');
        DELETE FROM public.login_email_claim WHERE email=OLD.email AND account_id=NEW.id AND kind='CURRENT';
        RETURN NEW;
    END IF;
    FOR value IN SELECT unnest(ARRAY[OLD.email,NEW.email]) ORDER BY 1 LOOP PERFORM lock_login_email(value); END LOOP;
    SELECT * INTO claim FROM login_email_claim WHERE email=NEW.email FOR UPDATE;
    IF claim.account_id IS DISTINCT FROM NEW.id OR claim.kind IS DISTINCT FROM 'IN_FLIGHT' OR NOT EXISTS (
        SELECT 1 FROM email_change e JOIN credential_operation p ON p.id=e.operation_id
        WHERE e.id=claim.change_id AND e.state='RECONCILING' AND p.state='APPLIED' AND p.kind='EMAIL'
            AND e.account_id=NEW.id AND e.old_email=OLD.email AND e.new_email=NEW.email
            AND OLD.credential_operation_pending AND p.security_epoch=OLD.security_epoch
            AND NEW.credential_generation=OLD.credential_generation+1) THEN
        RAISE EXCEPTION 'Email update requires an applied authorized operation' USING ERRCODE='23514';
    END IF;
    UPDATE login_email_claim SET kind='CURRENT',change_id=NULL,expires_at=NULL WHERE email=NEW.email;
    DELETE FROM login_email_claim WHERE email=OLD.email AND account_id=NEW.id AND kind='CURRENT';
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION coordinate_account_email() FROM PUBLIC;

CREATE FUNCTION scoped_redaction_intent(uuid,uuid,integer,uuid,text,uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb,text,jsonb,uuid,uuid,text,text,boolean) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN $14<>'ACCOUNT_EMAIL_V1' THEN public.scoped_redaction_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
 ELSE convert_to((convert_from(public.scoped_redaction_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13),'UTF8')::jsonb||jsonb_build_object('scopePolicy',$14,'fieldAction','PSEUDONYMIZE_LOGIN_EMAIL','replacement',public.retired_account_email($6),'identitySource',jsonb_build_object('tenantId',$16,'userId',$17,'endpoint',$18,'conformanceReference',$19,'allowAbsence',$20)))::text,'UTF8') END
$$;
CREATE FUNCTION scoped_redaction_completion(uuid,uuid,integer,uuid,text,uuid,uuid,text,timestamptz,bigint,boolean,text,text,jsonb,jsonb) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN $13<>'ACCOUNT_EMAIL_V1' THEN public.scoped_redaction_completion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
 ELSE convert_to((convert_from(public.scoped_redaction_completion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14),'UTF8')::jsonb||jsonb_build_object('identityObservation',$15))::text,'UTF8') END
$$;
CREATE FUNCTION identity_observation_snapshot(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$
 SELECT jsonb_build_object('id',id,'state',state,'observedAt',to_char(observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'tenantId',tenant_id,'userId',provider_user_id,'endpoint',endpoint,'conformanceReference',conformance_reference,'allowAbsence',absence_allowed) FROM public.privacy_identity_observation WHERE id=p_id
$$;
REVOKE ALL ON FUNCTION identity_observation_snapshot(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION protect_scoped_redaction_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_job'::regclass OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Original scoped redaction retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.scope_policy='ACCOUNT_EMAIL_V1' AND NOT EXISTS(SELECT 1 FROM public.managed_password_identity m JOIN public.privacy_redaction_executor_event p ON p.revision=NEW.executor_policy_revision WHERE m.account_id=NEW.requester_id AND(m.tenant_id,m.provider_user_id)=(NEW.provider_tenant_id,NEW.provider_user_id) AND(p.identity_tenant_id,p.identity_endpoint,p.identity_conformance_reference,p.identity_absence_allowed)=(NEW.provider_tenant_id,NEW.provider_endpoint,NEW.provider_conformance_reference,NEW.provider_absence_allowed)) THEN RAISE EXCEPTION 'Actual managed identity and observer policy required';END IF;
  IF NEW.created_xid<>pg_current_xact_id() OR NEW.revision<>1 OR NEW.state<>'APPROVED' OR NEW.created_at<>NEW.updated_at OR NEW.intent_body IS DISTINCT FROM public.scoped_redaction_intent(NEW.id,NEW.case_id,NEW.generation,NEW.organization_id,NEW.country,NEW.requester_id,NEW.expected_profile_revision,NEW.creator_id,NEW.qualification_revision,NEW.review_access_id,NEW.approval_audit_id,NEW.created_at,NEW.review_references,NEW.scope_policy,NEW.source_manifest,NEW.provider_tenant_id,NEW.provider_user_id,NEW.provider_endpoint,NEW.provider_conformance_reference,NEW.provider_absence_allowed)
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
 AND(to_jsonb(NEW)-ARRAY['revision','updated_at','state','outcome','resolution_actor','resolution_audit_id','resolution_from_revision','resolved_at','resolution_xid','profile_revision_after','field_changed','completion_body','affected_counts','identity_observation_id'])=(to_jsonb(OLD)-ARRAY['revision','updated_at','state','outcome','resolution_actor','resolution_audit_id','resolution_from_revision','resolved_at','resolution_xid','profile_revision_after','field_changed','completion_body','affected_counts','identity_observation_id'])
 AND(NEW.scope_policy='ACCOUNT_DISPLAY_NAME_V1' OR EXISTS(SELECT 1 FROM public.privacy_redaction_apply_source s WHERE s.job_id=NEW.id AND s.source_xid=pg_current_xact_id_if_assigned() AND(NEW.scope_policy<>'ACCOUNT_EMAIL_V1' OR(s.identity_observation_id=NEW.identity_observation_id AND NEW.identity_observation_id IS NOT NULL))))
 AND EXISTS(SELECT 1 FROM public.account_identity a JOIN public.audit_event e ON e.id=NEW.resolution_audit_id WHERE a.id=OLD.requester_id AND(a.display_name='[redacted]' AND NEW.scope_policy<>'ACCOUNT_EMAIL_V1' OR(NEW.scope_policy='ACCOUNT_EMAIL_V1' AND a.email=public.retired_account_email(a.id) AND NOT a.email_verified AND a.state='DEACTIVATED' AND a.privacy_retired_at IS NOT NULL)) AND a.revision=NEW.profile_revision_after AND e.actor_id=NEW.creator_id AND e.action='PRIVACY_REDACTION_APPLIED' AND e.resource_id=NEW.id AND e.occurred_at=NEW.resolved_at AND e.target_organization_id=NEW.organization_id AND e.target_country=NEW.country) THEN RETURN NEW;END IF;
 IF OLD.state IN('APPLIED','CANCELLED') AND NEW.state='COMPLETED' AND OLD.executor_role=public.scoped_redaction_caller() AND OLD.resolution_xid IS DISTINCT FROM pg_current_xact_id_if_assigned()
 AND(to_jsonb(NEW)-ARRAY['revision','updated_at','state','completion_sha256','completion_bytes','completion_key_version','completed_at'])=(to_jsonb(OLD)-ARRAY['revision','updated_at','state','completion_sha256','completion_bytes','completion_key_version','completed_at']) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Invalid scoped redaction transition';
END $$;

CREATE OR REPLACE FUNCTION prepare_scoped_redaction(p_plan uuid,p_access uuid,p_nonce bytea,p_actor uuid,p_session uuid,p_transport text,p_expected_revision bigint,p_refs jsonb,p_digest bytea,p_original jsonb,p_audit uuid,p_request uuid,p_at timestamptz,p_scope text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$
DECLARE c record;previous public.privacy_redaction_job%ROWTYPE;policy public.privacy_redaction_executor%ROWTYPE;subject public.account_identity%ROWTYPE;membership public.business_account%ROWTYPE;proof public.privacy_review_access%ROWTYPE;authentication public.application_session%ROWTYPE;counter bigint;sequence integer;body bytea;manifest jsonb:='[]'::jsonb;provider_tenant uuid;provider_user uuid;
BEGIN
 SELECT r.id,r.organization_id,r.country,r.requester_id,r.kind INTO c FROM public.read_privacy_review(p_access,p_nonce,p_actor,p_session,p_transport,p_at) r;
 IF NOT FOUND OR c.kind<>'REDACTION' THEN RETURN 'NOT_FOUND';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('scoped-redaction/'||p_plan::text,0));
 SELECT * INTO previous FROM public.privacy_redaction_job WHERE id=p_plan FOR UPDATE;
 IF FOUND THEN
  IF(previous.case_id,previous.creator_id) IS DISTINCT FROM(c.id,p_actor) THEN RETURN 'NOT_FOUND';END IF;
  IF previous.scope_policy IS DISTINCT FROM p_scope OR previous.approval_digest IS DISTINCT FROM p_digest THEN RETURN 'IDEMPOTENCY_MISMATCH';END IF;
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
 IF p_scope NOT IN('ACCOUNT_DISPLAY_NAME_V1','REQUESTER_NAMES_V1','ACCOUNT_EMAIL_V1') OR p_scope IS NULL THEN RETURN 'INVALID_SCOPE';END IF;
 IF p_scope='REQUESTER_NAMES_V1' THEN manifest:=public.requester_name_manifest(c.requester_id,c.organization_id);IF jsonb_array_length(manifest)>100000 THEN RETURN 'REDACTION_TOO_LARGE';END IF;END IF;
 IF p_scope='ACCOUNT_EMAIL_V1' THEN
  IF policy.identity_endpoint IS NULL THEN RETURN 'SERVICE_UNAVAILABLE';END IF;
  SELECT tenant_id,provider_user_id INTO provider_tenant,provider_user FROM public.managed_password_identity WHERE account_id=c.requester_id;
  IF NOT FOUND OR provider_tenant IS DISTINCT FROM policy.identity_tenant_id THEN RETURN 'MANAGED_IDENTITY_REQUIRED';END IF;
 END IF;
 body:=public.scoped_redaction_intent(p_plan,c.id,sequence,c.organization_id,c.country,c.requester_id,subject.revision,p_actor,proof.qualification_revision,p_access,p_audit,p_at,p_refs,p_scope,manifest,provider_tenant,provider_user,CASE WHEN p_scope='ACCOUNT_EMAIL_V1' THEN policy.identity_endpoint END,CASE WHEN p_scope='ACCOUNT_EMAIL_V1' THEN policy.identity_conformance_reference END,CASE WHEN p_scope='ACCOUNT_EMAIL_V1' THEN policy.identity_absence_allowed ELSE false END);
 IF octet_length(body)>16777216 THEN RETURN 'REDACTION_TOO_LARGE';END IF;
 INSERT INTO public.audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,reason,changed_fields,target_organization_id,target_country)
 VALUES(p_audit,'PLATFORM_ADMIN',p_actor,'PRIVACY_REDACTION_APPROVED','PRIVACY_REDACTION',p_plan,'SUCCESS',p_request,p_at,proof.reason,ARRAY['scopedRedaction'],c.organization_id,c.country);
 INSERT INTO public.privacy_redaction_job(provider_tenant_id,provider_user_id,provider_endpoint,provider_conformance_reference,provider_absence_allowed,scope_policy,source_manifest,id,case_id,organization_id,country,requester_id,generation,expected_profile_revision,executor_policy_revision,executor_role,environment_code,configuration_reference,creator_id,session_id,transport,qualification_revision,security_epoch,credential_generation,session_token_hash,auth_at,approval_expires_at,review_access_id,approval_audit_id,review_references,approval_digest,original_response,created_at,updated_at,intent_body,intent_plain_digest)
 VALUES(provider_tenant,provider_user,CASE WHEN p_scope='ACCOUNT_EMAIL_V1' THEN policy.identity_endpoint END,CASE WHEN p_scope='ACCOUNT_EMAIL_V1' THEN policy.identity_conformance_reference END,CASE WHEN p_scope='ACCOUNT_EMAIL_V1' THEN policy.identity_absence_allowed ELSE false END,p_scope,manifest,p_plan,c.id,c.organization_id,c.country,c.requester_id,sequence,subject.revision,policy.revision,policy.role_oid,policy.environment_code,policy.configuration_reference,p_actor,p_session,p_transport,proof.qualification_revision,proof.security_epoch,proof.credential_generation,proof.session_token_hash,authentication.auth_at,least(p_at+interval '60 seconds',authentication.auth_at+interval '300 seconds'),p_access,p_audit,p_refs,p_digest,p_original,p_at,p_at,body,sha256(body));RETURN 'OK';
END $$;

CREATE OR REPLACE FUNCTION guard_redaction_apply_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_apply_source'::regclass OR TG_OP<>'INSERT' OR NEW.source_xid<>pg_current_xact_id() OR NOT EXISTS(SELECT 1 FROM public.privacy_redaction_job j WHERE j.id=NEW.job_id AND j.scope_policy IN('REQUESTER_NAMES_V1','ACCOUNT_EMAIL_V1') AND j.state='INTENT_VERIFIED' AND j.intent_sha256 IS NOT NULL AND j.executor_role=public.scoped_redaction_caller() AND j.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND NEW.target_count=jsonb_array_length(j.source_manifest) AND((j.scope_policy='REQUESTER_NAMES_V1' AND NEW.identity_observation_id IS NULL) OR(j.scope_policy='ACCOUNT_EMAIL_V1' AND EXISTS(SELECT 1 FROM public.privacy_identity_observation o WHERE o.id=NEW.identity_observation_id AND o.job_id=j.id AND o.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND o.observed_at<=NEW.occurred_at AND NEW.occurred_at<o.observed_at+interval '15 seconds' AND NEW.occurred_at<j.approval_expires_at)))) THEN RAISE EXCEPTION 'Original guarded name action required';END IF;RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION apply_scoped_redaction(p_plan uuid,p_audit uuid,p_request uuid,p_at timestamptz)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$
DECLARE job public.privacy_redaction_job%ROWTYPE;subject public.account_identity%ROWTYPE;membership public.business_account%ROWTYPE;changed boolean;after_revision bigint;affected integer;body bytea;counts jsonb;observation public.privacy_identity_observation%ROWTYPE;old_address text;address text;
BEGIN
 SELECT * INTO job FROM public.privacy_redaction_job WHERE id=p_plan AND executor_role=public.scoped_redaction_caller() AND created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned();IF NOT FOUND THEN RETURN 'NOT_FOUND';END IF;
 IF job.state IN('APPLIED','CANCELLED','COMPLETED') THEN RETURN 'RESOLVED';END IF;
 IF job.scope_policy='ACCOUNT_EMAIL_V1' THEN
  SELECT email INTO old_address FROM public.account_identity WHERE id=job.requester_id;
  FOR address IN SELECT value FROM unnest(ARRAY[old_address,public.retired_account_email(job.requester_id)]) value ORDER BY value LOOP PERFORM public.lock_login_email(address);END LOOP;
 END IF;
 IF job.scope_policy='REQUESTER_NAMES_V1' THEN
  PERFORM o.id FROM public.organization o JOIN(SELECT job.organization_id AS id UNION SELECT(e->>'buyerId')::uuid FROM jsonb_array_elements(job.source_manifest) e UNION SELECT(e->>'vendorId')::uuid FROM jsonb_array_elements(job.source_manifest) e) targets ON targets.id=o.id ORDER BY o.id FOR UPDATE OF o;
 ELSE PERFORM id FROM public.organization WHERE id=job.organization_id FOR UPDATE;END IF;
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
 IF job.scope_policy='ACCOUNT_EMAIL_V1' THEN
  IF NOT EXISTS(SELECT 1 FROM public.managed_password_identity m WHERE m.account_id=job.requester_id AND(m.tenant_id,m.provider_user_id)=(job.provider_tenant_id,job.provider_user_id)) THEN RETURN 'IDENTITY_SOURCE_CHANGED';END IF;
  SELECT * INTO observation FROM public.privacy_identity_observation o WHERE o.job_id=job.id AND o.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND o.observed_at<=p_at AND p_at<o.observed_at+interval '15 seconds' ORDER BY o.observed_at DESC,o.id DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RETURN 'IDENTITY_CONTAINMENT_UNVERIFIED';END IF;
  IF subject.email<>public.retired_account_email(subject.id) AND EXISTS(SELECT 1 FROM public.login_email_claim WHERE email=public.retired_account_email(subject.id)) THEN RETURN 'EMAIL_ALREADY_RESERVED';END IF;
  INSERT INTO public.privacy_redaction_apply_source(job_id,source_xid,occurred_at,target_count,identity_observation_id) VALUES(job.id,pg_current_xact_id(),p_at,0,observation.id);
  changed:=subject.email IS DISTINCT FROM public.retired_account_email(subject.id) OR subject.email_verified OR subject.privacy_retired_at IS NULL;
  UPDATE public.account_identity SET email=public.retired_account_email(id),email_verified=false,privacy_retired_at=coalesce(privacy_retired_at,p_at),security_epoch=security_epoch+1,credential_generation=credential_generation+1,revision=revision+1,updated_at=p_at WHERE id=subject.id AND changed;
  GET DIAGNOSTICS affected=ROW_COUNT;changed:=affected=1;after_revision:=subject.revision+affected;
  counts:=jsonb_build_object('account_identity',affected,'purchase_order',0,'purchase_order_event',0,'order_submission_replay',0,'order_stage_assignment',0,'order_message',0,'message_replay',0);
 ELSE
 IF job.scope_policy='REQUESTER_NAMES_V1' THEN
  IF job.source_manifest IS DISTINCT FROM public.requester_name_manifest(job.requester_id,job.organization_id) THEN RETURN 'STALE_PLAN';END IF;
  INSERT INTO public.privacy_redaction_apply_source(job_id,source_xid,occurred_at,target_count) VALUES(job.id,pg_current_xact_id(),p_at,jsonb_array_length(job.source_manifest));
  counts:=public.apply_requester_name_manifest(job.id);
 END IF;
 changed:=subject.display_name IS DISTINCT FROM '[redacted]' OR coalesce((SELECT sum(value::bigint) FROM jsonb_each_text(counts)),0)>0;
 UPDATE public.account_identity SET display_name='[redacted]',revision=revision+1,updated_at=p_at WHERE id=job.requester_id AND changed;GET DIAGNOSTICS affected=ROW_COUNT;changed:=affected=1;after_revision:=subject.revision+affected;
 IF counts IS NOT NULL THEN counts:=counts||jsonb_build_object('account_identity',affected);END IF;
 END IF;
 INSERT INTO public.audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,target_organization_id,target_country)
 VALUES(p_audit,'PLATFORM_ADMIN',job.creator_id,'PRIVACY_REDACTION_APPLIED','PRIVACY_REDACTION',job.id,'SUCCESS',p_request,p_at,ARRAY['scopedRedaction'],job.organization_id,job.country);
 body:=public.scoped_redaction_completion(job.id,job.case_id,job.generation,job.organization_id,job.country,job.creator_id,p_audit,'APPLIED',p_at,after_revision,changed,job.intent_sha256,job.scope_policy,counts,public.identity_observation_snapshot(observation.id));
 UPDATE public.privacy_redaction_job SET state='APPLIED',revision=revision+1,updated_at=p_at,outcome='APPLIED',resolution_actor=creator_id,resolution_audit_id=p_audit,resolution_from_revision=revision,resolved_at=p_at,resolution_xid=pg_current_xact_id(),profile_revision_after=after_revision,field_changed=changed,affected_counts=counts,identity_observation_id=observation.id,completion_body=body WHERE id=p_plan;RETURN 'OK';
END $$;

CREATE OR REPLACE FUNCTION acknowledge_scoped_redaction(p_plan uuid,p_kind text,p_digest text,p_bytes integer,p_key_version text,p_at timestamptz)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ DECLARE job public.privacy_redaction_job%ROWTYPE;body bytea;BEGIN
 SELECT * INTO job FROM public.privacy_redaction_job WHERE id=p_plan AND executor_role=public.scoped_redaction_caller() AND created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() FOR UPDATE;
 IF NOT FOUND THEN RETURN 'NOT_FOUND';END IF;
 IF p_digest IS NULL OR p_digest!~'^[0-9a-f]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 37 AND 16777344 OR p_key_version IS NULL OR p_key_version!~'^v[1-9][0-9]{0,5}$' THEN RETURN 'EVIDENCE_CONFLICT';END IF;
 IF p_kind='INTENT' THEN
  IF job.intent_sha256 IS NOT NULL THEN IF(job.intent_sha256,job.intent_bytes,job.intent_key_version) IS NOT DISTINCT FROM(p_digest,p_bytes,p_key_version) THEN RETURN 'OK';ELSE RETURN 'EVIDENCE_CONFLICT';END IF;END IF;
  IF job.state NOT IN('APPROVED','CANCELLED') THEN RETURN 'INVALID_STATE';END IF;
  IF job.state='CANCELLED' THEN body:=public.scoped_redaction_completion(job.id,job.case_id,job.generation,job.organization_id,job.country,job.resolution_actor,job.resolution_audit_id,job.outcome,job.resolved_at,job.profile_revision_after,job.field_changed,p_digest,job.scope_policy,job.affected_counts,public.identity_observation_snapshot(job.identity_observation_id));END IF;
  UPDATE public.privacy_redaction_job SET state=CASE WHEN state='APPROVED' THEN 'INTENT_VERIFIED' ELSE state END,revision=revision+1,updated_at=p_at,intent_sha256=p_digest,intent_bytes=p_bytes,intent_key_version=p_key_version,completion_body=body WHERE id=p_plan;RETURN 'OK';
 ELSIF p_kind='COMPLETION' THEN
  IF job.state='COMPLETED' THEN IF(job.completion_sha256,job.completion_bytes,job.completion_key_version) IS NOT DISTINCT FROM(p_digest,p_bytes,p_key_version) THEN RETURN 'OK';ELSE RETURN 'EVIDENCE_CONFLICT';END IF;END IF;
  IF job.state NOT IN('APPLIED','CANCELLED') OR job.completion_body IS NULL OR job.resolution_xid IS NOT DISTINCT FROM pg_current_xact_id_if_assigned() THEN RETURN 'SOURCE_NOT_COMMITTED';END IF;
  UPDATE public.privacy_redaction_job SET state='COMPLETED',revision=revision+1,updated_at=p_at,completion_sha256=p_digest,completion_bytes=p_bytes,completion_key_version=p_key_version,completed_at=p_at WHERE id=p_plan;RETURN 'OK';
 END IF;RETURN 'INVALID_STATE';
END $$;

CREATE OR REPLACE FUNCTION cancel_scoped_redaction(p_plan uuid,p_access uuid,p_nonce bytea,p_actor uuid,p_session uuid,p_transport text,p_expected_revision bigint,p_digest bytea,p_response jsonb,p_audit uuid,p_request uuid,p_at timestamptz)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$ DECLARE c record;job public.privacy_redaction_job%ROWTYPE;reason text;body bytea;BEGIN
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
 IF job.intent_sha256 IS NOT NULL THEN body:=public.scoped_redaction_completion(job.id,job.case_id,job.generation,job.organization_id,job.country,p_actor,p_audit,'CANCELLED',p_at,NULL,NULL,job.intent_sha256,job.scope_policy,job.affected_counts,public.identity_observation_snapshot(job.identity_observation_id));END IF;
 UPDATE public.privacy_redaction_job SET state='CANCELLED',revision=revision+1,updated_at=p_at,outcome='CANCELLED',resolution_actor=p_actor,resolution_audit_id=p_audit,resolution_from_revision=revision,resolved_at=p_at,resolution_xid=pg_current_xact_id(),cancel_digest=p_digest,cancel_response=p_response,completion_body=body WHERE id=p_plan;RETURN 'OK';
END $$;

ALTER TABLE privacy_redaction_job DROP CONSTRAINT ck_redaction_affected_counts;
ALTER TABLE privacy_redaction_job ADD CONSTRAINT ck_redaction_affected_counts CHECK((scope_policy='ACCOUNT_DISPLAY_NAME_V1' AND affected_counts IS NULL) OR(scope_policy IN('REQUESTER_NAMES_V1','ACCOUNT_EMAIL_V1') AND((outcome IS DISTINCT FROM 'APPLIED' AND affected_counts IS NULL) OR(outcome='APPLIED' AND valid_redaction_counts(affected_counts)))));
CREATE OR REPLACE VIEW privacy_redaction_worker_work AS SELECT j.id,j.case_id,j.organization_id,j.country,j.requester_id,j.generation,j.scope_policy,j.expected_profile_revision,j.executor_policy_revision,j.environment_code,j.configuration_reference,j.revision,j.state,j.outcome,j.created_at,j.approval_expires_at,j.intent_body,j.intent_sha256,j.intent_bytes,j.intent_key_version,j.completion_sha256,j.completion_bytes,j.completion_key_version,CASE WHEN j.resolution_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() THEN j.completion_body ELSE NULL END AS completion_body,j.source_manifest,j.affected_counts,
 j.provider_tenant_id,j.provider_user_id,j.provider_endpoint,j.provider_conformance_reference,j.provider_absence_allowed,
 CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id',o.id,'state',o.state,'observedAt',to_char(o.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'tenantId',o.tenant_id,'userId',o.provider_user_id,'endpoint',o.endpoint,'conformanceReference',o.conformance_reference,'allowAbsence',o.absence_allowed) END AS identity_observation
 FROM privacy_redaction_job j LEFT JOIN privacy_identity_observation o ON o.id=j.identity_observation_id AND o.job_id=j.id WHERE j.executor_role=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND j.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned();
UPDATE backend_schema_version SET version=77 WHERE id=1;
