-- Read-only purpose projection: no raw field values, redaction, plan or case progress.
CREATE FUNCTION inspect_redaction_preview(selected_access uuid,presented_nonce bytea,selected_actor uuid,selected_session uuid,selected_transport text,at_time timestamptz)
 RETURNS TABLE(requester_id uuid,organization_id uuid,country varchar,account_state varchar,member_role varchar,credential_pending boolean,session_count bigint,hold_active boolean,submission_count bigint,event_count bigint,message_count bigint,contact_count bigint,location_count bigint,artifact_count bigint,audit_count bigint)
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c record;
BEGIN
 SELECT r.id,r.organization_id,r.country,r.kind,r.requester_id INTO c FROM public.read_privacy_review(selected_access,presented_nonce,selected_actor,selected_session,selected_transport,at_time) r;
 IF NOT FOUND OR c.kind<>'REDACTION' THEN RETURN;END IF;
 RETURN QUERY SELECT a.id,b.organization_id,c.country,a.state,b.role,a.credential_operation_pending,
  (SELECT count(*) FROM public.application_session s WHERE s.account_id=a.id AND s.token_hash IS NOT NULL AND s.revoked_at IS NULL AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation AND at_time<s.absolute_expires_at AND at_time<s.last_qualified_activity_at+interval '7 days'),
  EXISTS(SELECT 1 FROM public.retention_hold h WHERE h.state='ACTIVE'),
  (SELECT count(*) FROM(SELECT o.id FROM public.purchase_order o WHERE o.submitted_by=a.id AND o.buyer_id=b.organization_id AND o.country=c.country LIMIT 100001)x),
  (SELECT count(*) FROM(SELECT e.id FROM public.purchase_order_event e JOIN public.purchase_order o ON o.id=e.order_id WHERE e.actor_id=a.id AND b.organization_id IN(o.buyer_id,o.vendor_id) AND o.country=c.country LIMIT 100001)x),
  (SELECT count(*) FROM(SELECT m.id FROM public.order_message m JOIN public.purchase_order o ON o.id=m.order_id WHERE m.author_id=a.id AND m.author_organization_id=b.organization_id AND o.country=c.country LIMIT 100001)x),
  (SELECT count(*) FROM(SELECT p.id FROM public.business_contact p WHERE p.organization_id=b.organization_id LIMIT 100001)x),
  (SELECT count(*) FROM(SELECT p.id FROM public.organization_location p WHERE p.organization_id=b.organization_id LIMIT 100001)x),
  (SELECT count(*) FROM(SELECT p.id FROM public.privacy_export_job p WHERE p.organization_id=b.organization_id AND p.country=c.country AND p.artifact IS NOT NULL UNION ALL SELECT e.id FROM public.commercial_export e WHERE e.organization_id=b.organization_id AND e.country=c.country AND e.artifact IS NOT NULL LIMIT 100001)x),
  (SELECT count(*) FROM(SELECT e.id FROM public.audit_event e WHERE e.actor_id=a.id AND e.organization_id=b.organization_id AND e.country=c.country LIMIT 100001)x)
 FROM public.account_identity a JOIN public.business_account b ON b.id=a.id JOIN public.organization g ON g.id=b.organization_id
 WHERE a.id=c.requester_id AND b.organization_id=c.organization_id AND g.country=c.country;
END $$;
REVOKE ALL ON FUNCTION inspect_redaction_preview(uuid,bytea,uuid,uuid,text,timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION protect_privacy_review_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_review_access'::regclass THEN RAISE EXCEPTION 'Original review authorization source required';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.nonce_hash IS NULL OR NEW.created_xid<>pg_current_xact_id() THEN RAISE EXCEPTION 'Initial review proof required';END IF;
  IF NOT EXISTS(SELECT 1 FROM privacy_operator q JOIN account_identity a ON a.id=q.account_id JOIN application_session s ON s.account_id=a.id
   WHERE a.id=NEW.actor_id AND s.id=NEW.session_id AND q.enabled AND q.revision=NEW.qualification_revision AND q.created_at<=NEW.created_at
   AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending
   AND a.security_epoch=NEW.security_epoch AND a.credential_generation=NEW.credential_generation
   AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation AND s.transport=NEW.transport AND s.token_hash=NEW.session_token_hash
   AND s.revoked_at IS NULL AND s.auth_at<=NEW.created_at AND NEW.created_at<s.auth_at+interval '300 seconds'
   AND NEW.created_at<s.absolute_expires_at AND NEW.created_at<s.last_qualified_activity_at+interval '30 minutes') THEN RAISE EXCEPTION 'Current operator session required';END IF;
  IF NOT EXISTS(SELECT 1 FROM audit_event e WHERE e.id=NEW.id AND e.actor_type='PLATFORM_ADMIN' AND e.actor_id=NEW.actor_id
   AND e.action='PRIVACY_REVIEW_AUTHORIZED' AND e.resource_type='PRIVACY_CASE' AND e.resource_id=NEW.case_id
   AND e.target_organization_id=NEW.organization_id AND e.target_country=NEW.country AND e.reason=NEW.reason AND e.occurred_at=NEW.created_at) THEN RAISE EXCEPTION 'Matching review audit required';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.nonce_hash IS NOT NULL AND NEW.nonce_hash IS NULL AND NEW.session_token_hash IS NULL AND(to_jsonb(NEW)-ARRAY['nonce_hash','session_token_hash'])=(to_jsonb(OLD)-ARRAY['nonce_hash','session_token_hash']) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Review authorization immutable';
END $$;
REVOKE ALL ON FUNCTION protect_privacy_review_access() FROM PUBLIC;

-- Existing committed review authorization/evidence also covers the non-content preview assessment.
CREATE OR REPLACE FUNCTION protect_privacy_review_read() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_review_read'::regclass OR TG_LEVEL<>'ROW' THEN RAISE EXCEPTION 'Private review source required';END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Private review evidence immutable';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.privacy_review_access p JOIN public.audit_event e ON e.id=NEW.audit_id WHERE p.id=NEW.access_id
  AND p.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND e.actor_type='PLATFORM_ADMIN' AND e.actor_id=p.actor_id
  AND(e.action='PRIVACY_CASE_PRIVATE_READ' OR(e.action='PRIVACY_REDACTION_PREVIEWED' AND e.changed_fields=ARRAY['redactionPreview']::text[] AND EXISTS(SELECT 1 FROM public.privacy_case c WHERE c.id=p.case_id AND c.kind='REDACTION'))) AND e.resource_type='PRIVACY_CASE' AND e.resource_id=p.case_id
  AND e.target_organization_id=p.organization_id AND e.target_country=p.country AND e.occurred_at>=p.created_at AND e.occurred_at<p.expires_at) THEN RAISE EXCEPTION 'Committed review source required';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_privacy_review_read() FROM PUBLIC;
DO $$ DECLARE previous text;BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR(resource_type=''PRIVACY_CASE'' AND actor_type=''PLATFORM_ADMIN'' AND target_organization_id IS NOT NULL AND action=''PRIVACY_REDACTION_PREVIEWED''))',previous);
END $$;
UPDATE backend_schema_version SET version=74 WHERE id=1;
