-- Qualified immutable assisted scope review. Terminal resolution does not assert universal erasure.
CREATE FUNCTION valid_case_disposition_items(items jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$ DECLARE e jsonb;family text;decision text;families text[]:=ARRAY['CURRENT_DISPLAY_NAME','HISTORICAL_ATTRIBUTION','LOGIN_EMAIL','SHARED_MESSAGE_TEXT','CONTACTS_LOCATIONS','COMMERCIAL_DOCUMENTS_MEDIA','AUDIT_IDENTITY_HISTORY','PROVIDER_DELIVERY_COPIES','BACKUPS_ARCHIVES','ADDITIONAL_SCOPE'];BEGIN
 IF items IS NULL OR jsonb_typeof(items)<>'array' OR jsonb_array_length(items)<>10 THEN RETURN false;END IF;
 IF(SELECT count(DISTINCT value->>'family') FROM jsonb_array_elements(items))<>10 THEN RETURN false;END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF jsonb_typeof(e)<>'object' OR(SELECT count(*) FROM jsonb_object_keys(e))<>4 OR NOT(e?&ARRAY['family','disposition','jobId','reference']) THEN RETURN false;END IF;
  family:=e->>'family';decision:=e->>'disposition';
  IF jsonb_typeof(e->'family')<>'string' OR NOT(family=ANY(families)) OR jsonb_typeof(e->'disposition')<>'string' OR decision NOT IN('APPLIED','RETAINED','PENDING','REVIEWED_NO_ADDITIONAL_SCOPE') OR jsonb_typeof(e->'reference')<>'string' OR(e->>'reference')!~'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$' THEN RETURN false;END IF;
  IF decision='APPLIED' THEN IF family NOT IN('CURRENT_DISPLAY_NAME','HISTORICAL_ATTRIBUTION','LOGIN_EMAIL') OR jsonb_typeof(e->'jobId')<>'string' OR(e->>'jobId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false;END IF;
  ELSIF e->'jobId'<>'null'::jsonb THEN RETURN false;END IF;
  IF family='ADDITIONAL_SCOPE' AND decision NOT IN('PENDING','REVIEWED_NO_ADDITIONAL_SCOPE') OR family<>'ADDITIONAL_SCOPE' AND decision='REVIEWED_NO_ADDITIONAL_SCOPE' THEN RETURN false;END IF;
 END LOOP;RETURN true;
END $$;
CREATE TABLE privacy_case_disposition(
 id uuid PRIMARY KEY CHECK(id::text~'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 case_id uuid NOT NULL REFERENCES privacy_case(id),organization_id uuid NOT NULL REFERENCES organization(id),country varchar(2) NOT NULL CHECK(country IN('RS','BA')),requester_id uuid NOT NULL REFERENCES account_identity(id),
 sequence integer NOT NULL CHECK(sequence>0),base_case_revision bigint NOT NULL CHECK(base_case_revision>0),profile_revision bigint NOT NULL CHECK(profile_revision>0),
 creator_id uuid NOT NULL REFERENCES platform_account(id),review_access_id uuid NOT NULL REFERENCES privacy_review_access(id),audit_id uuid NOT NULL REFERENCES audit_event(id),
 items jsonb NOT NULL CHECK(valid_case_disposition_items(items)),resolve_case boolean NOT NULL,accept_retained_scope boolean NOT NULL,review_references jsonb NOT NULL CHECK(scoped_redaction_references(review_references)),
 request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),original_response jsonb NOT NULL CHECK(jsonb_typeof(original_response)='object' AND original_response->'allDataErased'='false'::jsonb),
 created_at timestamptz(3) NOT NULL,created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),UNIQUE(case_id,sequence),UNIQUE(case_id,id),
 CHECK(NOT resolve_case OR(accept_retained_scope AND NOT jsonb_path_exists(items,'$[*] ? (@.disposition == "PENDING")'))));
CREATE INDEX ix_case_disposition_case ON privacy_case_disposition(case_id,sequence DESC);
CREATE VIEW privacy_case_disposition_metadata AS SELECT id,case_id,organization_id,country,sequence,base_case_revision,profile_revision,creator_id,items,resolve_case,accept_retained_scope,review_references,original_response,created_at FROM privacy_case_disposition;
CREATE OR REPLACE VIEW privacy_redaction_fulfillment_metadata AS
 SELECT c.id AS case_id,coalesce(p.revision,1)+coalesce(r.total,0) AS revision,CASE WHEN coalesce(r.resolved,false) THEN 'COMPLETED'::text ELSE 'REVIEWING'::text END AS state
 FROM privacy_case c LEFT JOIN privacy_redaction_progress p ON p.case_id=c.id
 LEFT JOIN LATERAL(SELECT count(*)::bigint AS total,bool_or(resolve_case) AS resolved FROM privacy_case_disposition WHERE case_id=c.id) r ON true
 WHERE c.kind='REDACTION' AND(p.case_id IS NOT NULL OR coalesce(r.total,0)>0);
DO $$ DECLARE previous text;BEGIN SELECT pg_get_expr(conbin,conrelid) INTO previous FROM pg_constraint WHERE conrelid='public.audit_event'::regclass AND conname='ck_audit_action_resource';
 EXECUTE 'ALTER TABLE public.audit_event DROP CONSTRAINT ck_audit_action_resource';
 EXECUTE 'ALTER TABLE public.audit_event ADD CONSTRAINT ck_audit_action_resource CHECK(('||previous||') OR(action IN(''PRIVACY_DISPOSITION_RECORDED'',''PRIVACY_DISPOSITION_READ'') AND actor_type=''PLATFORM_ADMIN'' AND organization_id IS NULL AND country IS NULL AND target_organization_id IS NOT NULL AND target_country IS NOT NULL AND resource_type=''PRIVACY_CASE''))';END $$;
CREATE FUNCTION protect_case_disposition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$ BEGIN
 IF TG_RELID<>'public.privacy_case_disposition'::regclass OR TG_OP<>'INSERT' OR NEW.created_xid<>pg_current_xact_id() THEN RAISE EXCEPTION 'Append-only original disposition source required';END IF;
 IF EXISTS(SELECT 1 FROM public.privacy_case_disposition WHERE case_id=NEW.case_id AND resolve_case) OR NEW.sequence<>(SELECT coalesce(max(sequence),0)+1 FROM public.privacy_case_disposition WHERE case_id=NEW.case_id)
 OR NEW.base_case_revision<>coalesce((SELECT revision FROM public.privacy_redaction_fulfillment_metadata WHERE case_id=NEW.case_id),1)
 OR NOT EXISTS(SELECT 1 FROM public.privacy_case c JOIN public.account_identity a ON a.id=c.requester_id JOIN public.privacy_review_access p ON p.case_id=c.id JOIN public.audit_event e ON e.id=NEW.audit_id WHERE c.id=NEW.case_id AND c.kind='REDACTION' AND(c.organization_id,c.country,c.requester_id,a.revision)=(NEW.organization_id,NEW.country,NEW.requester_id,NEW.profile_revision) AND p.id=NEW.review_access_id AND p.actor_id=NEW.creator_id AND p.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND NEW.created_at>=p.created_at AND NEW.created_at<p.expires_at AND e.actor_id=NEW.creator_id AND e.action='PRIVACY_DISPOSITION_RECORDED' AND e.resource_type='PRIVACY_CASE' AND e.resource_id=c.id AND e.target_organization_id=c.organization_id AND e.target_country=c.country AND e.occurred_at=NEW.created_at)
 THEN RAISE EXCEPTION 'Actual case disposition authority and source required';END IF;
 IF NEW.original_response->'allDataErased' IS DISTINCT FROM 'false'::jsonb OR NEW.original_response->>'id' IS DISTINCT FROM NEW.id::text OR NEW.original_response->>'caseId' IS DISTINCT FROM NEW.case_id::text OR NEW.original_response->>'organizationId' IS DISTINCT FROM NEW.organization_id::text OR NEW.original_response->>'country' IS DISTINCT FROM NEW.country OR NEW.original_response->'items' IS DISTINCT FROM NEW.items OR NEW.original_response->'assistedReviewResolved' IS DISTINCT FROM to_jsonb(NEW.resolve_case) OR NEW.original_response->>'state' IS DISTINCT FROM (CASE WHEN NEW.resolve_case THEN 'COMPLETED' ELSE 'REVIEWING' END) THEN RAISE EXCEPTION 'Exact non-content original result required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_case_disposition() FROM PUBLIC;
CREATE TRIGGER tr_case_disposition BEFORE INSERT OR UPDATE OR DELETE ON privacy_case_disposition FOR EACH ROW EXECUTE FUNCTION protect_case_disposition();
CREATE TRIGGER tr_case_disposition_no_truncate BEFORE TRUNCATE ON privacy_case_disposition FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION record_case_disposition(p_id uuid,p_access uuid,p_nonce bytea,p_actor uuid,p_session uuid,p_transport text,p_expected bigint,p_items jsonb,p_resolve boolean,p_accept boolean,p_refs jsonb,p_digest bytea,p_original jsonb,p_audit uuid,p_request uuid,p_at timestamptz) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$
DECLARE c record;old public.privacy_case_disposition%ROWTYPE;subject public.account_identity%ROWTYPE;counter bigint;sequence integer;item jsonb;expected_scope text;proof public.privacy_review_access%ROWTYPE;BEGIN
 SELECT r.id,r.organization_id,r.country,r.requester_id,r.kind INTO c FROM public.read_privacy_review(p_access,p_nonce,p_actor,p_session,p_transport,p_at) r;IF NOT FOUND OR c.kind<>'REDACTION' THEN RETURN 'NOT_FOUND';END IF;
 PERFORM id FROM public.organization WHERE id=c.organization_id FOR UPDATE;
 PERFORM id FROM public.account_identity WHERE id IN(p_actor,c.requester_id) ORDER BY id FOR UPDATE;
 PERFORM id FROM public.application_session WHERE id=p_session FOR UPDATE;
 PERFORM account_id FROM public.privacy_operator WHERE account_id=p_actor FOR SHARE;
 -- Recheck after every committing guard is held; a pre-lock read is not continuing authority.
 PERFORM 1 FROM public.read_privacy_review(p_access,p_nonce,p_actor,p_session,p_transport,p_at);IF NOT FOUND THEN RETURN 'NOT_FOUND';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('case-disposition/'||p_id::text,0));
 SELECT * INTO old FROM public.privacy_case_disposition WHERE id=p_id;
 IF FOUND THEN IF(old.case_id,old.creator_id) IS DISTINCT FROM(c.id,p_actor) THEN RETURN 'NOT_FOUND';END IF;IF old.request_digest IS DISTINCT FROM p_digest THEN RETURN 'IDEMPOTENCY_MISMATCH';END IF;IF p_at>=old.created_at+interval '7 days' THEN RETURN 'REPLAY_EXPIRED';END IF;RETURN 'REPLAY';END IF;
 IF EXISTS(SELECT 1 FROM public.privacy_case_disposition WHERE case_id=c.id AND resolve_case) THEN RETURN 'CASE_CLOSED';END IF;
 SELECT coalesce((SELECT revision FROM public.privacy_redaction_fulfillment_metadata WHERE case_id=c.id),1) INTO counter;IF counter<>p_expected THEN RETURN 'REVISION_MISMATCH';END IF;
 IF NOT coalesce(public.valid_case_disposition_items(p_items),false) OR NOT coalesce(public.scoped_redaction_references(p_refs),false) OR p_resolve IS NULL OR p_accept IS NULL THEN RETURN 'INVALID_DISPOSITION';END IF;
 IF p_resolve AND(NOT p_accept OR jsonb_path_exists(p_items,'$[*] ? (@.disposition == "PENDING")')) THEN RETURN 'SCOPE_PENDING';END IF;
 SELECT * INTO subject FROM public.account_identity WHERE id=c.requester_id;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) WHERE value->>'disposition'='APPLIED' LOOP
  expected_scope:=CASE item->>'family' WHEN 'CURRENT_DISPLAY_NAME' THEN 'ACCOUNT_DISPLAY_NAME_V1' WHEN 'HISTORICAL_ATTRIBUTION' THEN 'REQUESTER_NAMES_V1' WHEN 'LOGIN_EMAIL' THEN 'ACCOUNT_EMAIL_V1' END;
  IF NOT EXISTS(SELECT 1 FROM public.privacy_redaction_job j WHERE j.id=(item->>'jobId')::uuid AND j.case_id=c.id AND j.requester_id=c.requester_id AND(j.scope_policy=expected_scope OR(expected_scope='ACCOUNT_DISPLAY_NAME_V1' AND j.scope_policy='REQUESTER_NAMES_V1')) AND j.state='COMPLETED' AND j.outcome='APPLIED' AND j.intent_sha256 IS NOT NULL AND j.completion_sha256 IS NOT NULL AND j.resolution_xid IS DISTINCT FROM pg_current_xact_id_if_assigned()) THEN RETURN 'ACTION_NOT_COMPLETED';END IF;
  IF expected_scope IN('ACCOUNT_DISPLAY_NAME_V1','REQUESTER_NAMES_V1') AND subject.display_name<>'[redacted]' OR expected_scope='ACCOUNT_EMAIL_V1' AND(subject.email<>public.retired_account_email(subject.id) OR subject.email_verified OR subject.privacy_retired_at IS NULL) THEN RETURN 'STALE_PLAN';END IF;
 END LOOP;
 IF p_resolve THEN
  IF public.retention_preservation_active() THEN RETURN 'HOLD_ACTIVE';END IF;
  IF EXISTS(SELECT 1 FROM public.privacy_redaction_job WHERE requester_id=subject.id AND state<>'COMPLETED') THEN RETURN 'WORK_PENDING';END IF;
  IF subject.credential_operation_pending THEN RETURN 'CREDENTIAL_RECONCILIATION_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM public.business_account WHERE id=subject.id AND role='OWNER') THEN RETURN 'OWNER_PROTECTED';END IF;
  IF subject.state<>'DEACTIVATED' OR EXISTS(SELECT 1 FROM public.application_session s WHERE s.account_id=subject.id AND s.token_hash IS NOT NULL AND s.revoked_at IS NULL AND s.security_epoch=subject.security_epoch AND s.credential_generation=subject.credential_generation AND p_at<s.absolute_expires_at AND p_at<s.last_qualified_activity_at+interval '7 days') THEN RETURN 'SUBJECT_NOT_CONTAINED';END IF;
 END IF;
 SELECT * INTO proof FROM public.privacy_review_access WHERE id=p_access;
 SELECT coalesce(max(d.sequence),0)+1 INTO sequence FROM public.privacy_case_disposition d WHERE case_id=c.id;
 INSERT INTO public.audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,reason,changed_fields,target_organization_id,target_country) VALUES(p_audit,'PLATFORM_ADMIN',p_actor,'PRIVACY_DISPOSITION_RECORDED','PRIVACY_CASE',c.id,'SUCCESS',p_request,p_at,proof.reason,ARRAY['disposition'],c.organization_id,c.country);
 INSERT INTO public.privacy_case_disposition(id,case_id,organization_id,country,requester_id,sequence,base_case_revision,profile_revision,creator_id,review_access_id,audit_id,items,resolve_case,accept_retained_scope,review_references,request_digest,original_response,created_at) VALUES(p_id,c.id,c.organization_id,c.country,c.requester_id,sequence,counter,subject.revision,p_actor,p_access,p_audit,p_items,p_resolve,p_accept,p_refs,p_digest,p_original,p_at);RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION record_case_disposition(uuid,uuid,bytea,uuid,uuid,text,bigint,jsonb,boolean,boolean,jsonb,bytea,jsonb,uuid,uuid,timestamptz) FROM PUBLIC;

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
 IF EXISTS(SELECT 1 FROM public.privacy_case_disposition WHERE case_id=c.id AND resolve_case) THEN RETURN 'CASE_CLOSED';END IF;
 PERFORM id FROM public.privacy_redaction_job WHERE case_id=c.id ORDER BY generation FOR UPDATE;
 SELECT coalesce((SELECT revision FROM public.privacy_redaction_fulfillment_metadata WHERE case_id=c.id),1) INTO counter;
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
CREATE FUNCTION block_completed_case_new_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_job'::regclass OR TG_OP<>'INSERT' OR EXISTS(SELECT 1 FROM public.privacy_case_disposition WHERE case_id=NEW.case_id AND resolve_case) THEN RAISE EXCEPTION 'Resolved case cannot acquire new scoped work';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION block_completed_case_new_scope() FROM PUBLIC;
CREATE TRIGGER tr_completed_case_new_scope BEFORE INSERT ON privacy_redaction_job FOR EACH ROW EXECUTE FUNCTION block_completed_case_new_scope();
UPDATE backend_schema_version SET version=78 WHERE id=1;
