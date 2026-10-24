-- Exact source manifests and narrow historical attribution exceptions; no general commercial edits.
ALTER TABLE privacy_redaction_job DROP CONSTRAINT privacy_redaction_job_scope_policy_check;
ALTER TABLE privacy_redaction_job ADD CONSTRAINT privacy_redaction_job_scope_policy_check CHECK(scope_policy IN('ACCOUNT_DISPLAY_NAME_V1','REQUESTER_NAMES_V1'));
ALTER TABLE privacy_redaction_job ADD COLUMN source_manifest jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(source_manifest)='array' AND jsonb_array_length(source_manifest)<=100000), ADD COLUMN affected_counts jsonb;
ALTER TABLE privacy_redaction_job DROP CONSTRAINT privacy_redaction_job_intent_body_check;
ALTER TABLE privacy_redaction_job ADD CONSTRAINT privacy_redaction_job_intent_body_check CHECK(octet_length(intent_body) BETWEEN 1 AND 16777216);
CREATE INDEX ix_order_submitter_redaction ON purchase_order(submitted_by,id);
CREATE INDEX ix_event_actor_redaction ON purchase_order_event(actor_id,id);
CREATE INDEX ix_message_author_redaction ON order_message(author_id,id);

CREATE FUNCTION requester_name_manifest(subject uuid,organization uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 WITH rows AS(
 SELECT 'purchase_order' AS family,jsonb_build_object('id',o.id) AS identity,o.id AS order_id,o.buyer_id,o.vendor_id,o.revision FROM public.purchase_order o WHERE o.submitted_by=subject AND o.buyer_id=organization
 UNION ALL SELECT 'purchase_order_event',jsonb_build_object('id',e.id),o.id,o.buyer_id,o.vendor_id,e.revision FROM public.purchase_order_event e JOIN public.purchase_order o ON o.id=e.order_id WHERE(e.actor_id=subject AND organization IN(o.buyer_id,o.vendor_id)) OR(o.submitted_by=subject AND o.buyer_id=organization AND e.result IS NOT NULL)
 UNION ALL SELECT 'order_submission_replay',jsonb_build_object('order_id',r.order_id),o.id,o.buyer_id,o.vendor_id,o.revision FROM public.order_submission_replay r JOIN public.purchase_order o ON o.id=r.order_id WHERE r.actor_id=subject AND r.buyer_id=organization AND r.original_result IS NOT NULL
 UNION ALL SELECT 'order_stage_assignment',jsonb_build_object('order_id',r.order_id,'expected_revision',r.expected_revision,'payload',r.payload),o.id,o.buyer_id,o.vendor_id,r.from_revision FROM public.order_stage_assignment r JOIN public.purchase_order o ON o.id=r.order_id WHERE o.submitted_by=subject AND o.buyer_id=organization
 UNION ALL SELECT 'order_message',jsonb_build_object('id',m.id),o.id,o.buyer_id,o.vendor_id,1 FROM public.order_message m JOIN public.purchase_order o ON o.id=m.order_id WHERE m.author_id=subject AND m.author_organization_id=organization
 UNION ALL SELECT 'message_replay',jsonb_build_object('message_id',r.message_id),o.id,o.buyer_id,o.vendor_id,1 FROM public.message_replay r JOIN public.purchase_order o ON o.id=r.order_id WHERE r.actor_id=subject AND r.organization_id=organization AND r.original_result IS NOT NULL
 ),bounded AS(SELECT * FROM rows LIMIT 100001)
 SELECT coalesce(jsonb_agg(jsonb_build_object('family',family,'identity',identity,'orderId',order_id,'buyerId',buyer_id,'vendorId',vendor_id,'sourceRevision',revision) ORDER BY family,identity::text),'[]'::jsonb) FROM bounded
$$;
REVOKE ALL ON FUNCTION requester_name_manifest(uuid,uuid) FROM PUBLIC;

CREATE TABLE privacy_redaction_apply_source(job_id uuid PRIMARY KEY REFERENCES privacy_redaction_job(id),source_xid xid8 NOT NULL UNIQUE,occurred_at timestamptz(3) NOT NULL,target_count integer NOT NULL CHECK(target_count BETWEEN 0 AND 100000));
CREATE FUNCTION guard_redaction_apply_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_apply_source'::regclass OR TG_OP<>'INSERT' OR NEW.source_xid<>pg_current_xact_id() OR NOT EXISTS(SELECT 1 FROM public.privacy_redaction_job j WHERE j.id=NEW.job_id AND j.scope_policy='REQUESTER_NAMES_V1' AND j.state='INTENT_VERIFIED' AND j.intent_sha256 IS NOT NULL AND j.executor_role=public.scoped_redaction_caller() AND j.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND NEW.target_count=jsonb_array_length(j.source_manifest)) THEN RAISE EXCEPTION 'Original guarded name action required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_redaction_apply_source() FROM PUBLIC;
CREATE TRIGGER tr_redaction_apply_source BEFORE INSERT OR UPDATE OR DELETE ON privacy_redaction_apply_source FOR EACH ROW EXECUTE FUNCTION guard_redaction_apply_source();
CREATE TRIGGER tr_redaction_apply_source_no_truncate BEFORE TRUNCATE ON privacy_redaction_apply_source FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();

CREATE TABLE privacy_redaction_apply_item(job_id uuid NOT NULL REFERENCES privacy_redaction_apply_source(job_id),position integer NOT NULL CHECK(position BETWEEN 0 AND 99999),entry jsonb NOT NULL,family text GENERATED ALWAYS AS(entry->>'family') STORED,identity jsonb GENERATED ALWAYS AS(entry->'identity') STORED,PRIMARY KEY(job_id,family,identity),UNIQUE(job_id,position));
CREATE FUNCTION guard_redaction_apply_item() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_apply_item'::regclass OR TG_OP<>'INSERT' OR pg_trigger_depth()<2 OR NOT EXISTS(SELECT 1 FROM public.privacy_redaction_apply_source s JOIN public.privacy_redaction_job j ON j.id=s.job_id WHERE s.job_id=NEW.job_id AND s.source_xid=pg_current_xact_id_if_assigned() AND j.state='INTENT_VERIFIED' AND j.executor_role=public.scoped_redaction_caller() AND NEW.position<s.target_count) THEN RAISE EXCEPTION 'Fixed transaction source manifest required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION guard_redaction_apply_item() FROM PUBLIC;
CREATE TRIGGER tr_redaction_apply_item BEFORE INSERT OR UPDATE OR DELETE ON privacy_redaction_apply_item FOR EACH ROW EXECUTE FUNCTION guard_redaction_apply_item();
CREATE TRIGGER tr_redaction_apply_item_no_truncate BEFORE TRUNCATE ON privacy_redaction_apply_item FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();

CREATE FUNCTION record_redaction_apply_items() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_apply_source'::regclass OR NEW.source_xid<>pg_current_xact_id() THEN RAISE EXCEPTION 'Original manifest source required';END IF;
 INSERT INTO public.privacy_redaction_apply_item(job_id,position,entry) SELECT NEW.job_id,(e.ordinality-1)::integer,e.value FROM public.privacy_redaction_job j CROSS JOIN LATERAL jsonb_array_elements(j.source_manifest) WITH ORDINALITY e WHERE j.id=NEW.job_id;RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION record_redaction_apply_items() FROM PUBLIC;
CREATE TRIGGER tr_redaction_apply_items_record AFTER INSERT ON privacy_redaction_apply_source FOR EACH ROW EXECUTE FUNCTION record_redaction_apply_items();

-- Returns the one permitted projection, retaining every unrelated column and JSON member.
CREATE FUNCTION redacted_name_projection(family text,value jsonb,subject uuid) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$ DECLARE result jsonb:=value;body jsonb;BEGIN
 IF family='purchase_order' AND value->>'submitted_by'=subject::text THEN result:=jsonb_set(result,'{snapshot,submittedByDisplayName}','"[redacted]"'::jsonb,false);
 ELSIF family='purchase_order_event' THEN
  IF value->>'actor_id'=subject::text THEN result:=jsonb_set(result,'{actor_display_name}','"[redacted]"'::jsonb,false);END IF;
  IF value#>>'{result,submittedByAccountId}'=subject::text THEN result:=jsonb_set(result,'{result,submittedByDisplayName}','"[redacted]"'::jsonb,false);END IF;
 ELSIF family='order_submission_replay' AND value->>'actor_id'=subject::text AND jsonb_typeof(value->'original_result')='object' THEN result:=jsonb_set(result,'{original_result,submittedByDisplayName}','"[redacted]"'::jsonb,false);
 ELSIF family='order_stage_assignment' AND value#>>'{result,submittedByAccountId}'=subject::text THEN result:=jsonb_set(result,'{result,submittedByDisplayName}','"[redacted]"'::jsonb,false);
 ELSIF family='order_message' AND value->>'author_id'=subject::text THEN result:=jsonb_set(result,'{author_display_name}','"[redacted]"'::jsonb,false);
 ELSIF family='message_replay' AND value->>'actor_id'=subject::text AND jsonb_typeof(value->'original_result')='object' THEN result:=jsonb_set(result,'{original_result,authorDisplayName}','"[redacted]"'::jsonb,false);
 END IF;RETURN result;
END $$;

CREATE FUNCTION permitted_name_projection(target regclass,before_row jsonb,after_row jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ DECLARE v_job uuid;v_subject uuid;v_family text;v_identity jsonb;BEGIN
 v_family:=CASE target WHEN 'public.purchase_order'::regclass THEN 'purchase_order' WHEN 'public.purchase_order_event'::regclass THEN 'purchase_order_event' WHEN 'public.order_submission_replay'::regclass THEN 'order_submission_replay' WHEN 'public.order_stage_assignment'::regclass THEN 'order_stage_assignment' WHEN 'public.order_message'::regclass THEN 'order_message' WHEN 'public.message_replay'::regclass THEN 'message_replay' END;
 IF v_family IS NULL THEN RETURN false;END IF;
 SELECT j.id,j.requester_id INTO v_job,v_subject FROM public.privacy_redaction_apply_source s JOIN public.privacy_redaction_job j ON j.id=s.job_id WHERE s.source_xid=pg_current_xact_id_if_assigned() AND j.executor_role=public.scoped_redaction_caller() AND j.state='INTENT_VERIFIED' AND j.scope_policy='REQUESTER_NAMES_V1';IF NOT FOUND THEN RETURN false;END IF;
 v_identity:=CASE v_family WHEN 'order_submission_replay' THEN jsonb_build_object('order_id',before_row->'order_id') WHEN 'message_replay' THEN jsonb_build_object('message_id',before_row->'message_id') WHEN 'order_stage_assignment' THEN jsonb_build_object('order_id',before_row->'order_id','expected_revision',before_row->'expected_revision','payload',before_row->'payload') ELSE jsonb_build_object('id',before_row->'id') END;
 RETURN before_row IS DISTINCT FROM after_row AND after_row=public.redacted_name_projection(v_family,before_row,v_subject) AND EXISTS(SELECT 1 FROM public.privacy_redaction_apply_item i WHERE i.job_id=v_job AND i.family=v_family AND i.identity=v_identity);
END $$;
REVOKE ALL ON FUNCTION permitted_name_projection(regclass,jsonb,jsonb) FROM PUBLIC;
CREATE FUNCTION guard_attribution_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_OP='UPDATE' AND public.permitted_name_projection(TG_RELID,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW;END IF;RAISE EXCEPTION 'Historical source immutable';
END $$;
REVOKE ALL ON FUNCTION guard_attribution_history() FROM PUBLIC;
CREATE FUNCTION guard_attribution_replay() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.original_result IS NULL AND OLD.original_result IS NOT NULL AND(to_jsonb(NEW)-'original_result')=(to_jsonb(OLD)-'original_result') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND public.permitted_name_projection(TG_RELID,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW;END IF;RAISE EXCEPTION 'Original success immutable';
END $$;
REVOKE ALL ON FUNCTION guard_attribution_replay() FROM PUBLIC;
DROP TRIGGER tr_order ON purchase_order;
CREATE TRIGGER tr_order BEFORE INSERT ON purchase_order FOR EACH ROW EXECUTE FUNCTION guard_order();
CREATE TRIGGER tr_order_immutable BEFORE UPDATE OR DELETE ON purchase_order FOR EACH ROW EXECUTE FUNCTION guard_attribution_history();
DROP TRIGGER tr_order_event_immutable ON purchase_order_event;
CREATE TRIGGER tr_order_event_immutable BEFORE UPDATE OR DELETE ON purchase_order_event FOR EACH ROW EXECUTE FUNCTION guard_attribution_history();
DROP TRIGGER tr_stage_assignment_immutable ON order_stage_assignment;
CREATE TRIGGER tr_stage_assignment_immutable BEFORE UPDATE OR DELETE ON order_stage_assignment FOR EACH ROW EXECUTE FUNCTION guard_attribution_history();
DROP TRIGGER tr_order_message_immutable ON order_message;
CREATE TRIGGER tr_order_message_immutable BEFORE UPDATE OR DELETE ON order_message FOR EACH ROW EXECUTE FUNCTION guard_attribution_history();
DROP TRIGGER tr_order_replay ON order_submission_replay;
CREATE TRIGGER tr_order_replay BEFORE UPDATE OR DELETE ON order_submission_replay FOR EACH ROW EXECUTE FUNCTION guard_attribution_replay();
DROP TRIGGER tr_message_replay ON message_replay;
CREATE TRIGGER tr_message_replay BEFORE INSERT ON message_replay FOR EACH ROW EXECUTE FUNCTION guard_message_replay();
CREATE TRIGGER tr_message_replay_immutable BEFORE UPDATE OR DELETE ON message_replay FOR EACH ROW EXECUTE FUNCTION guard_attribution_replay();

CREATE FUNCTION apply_requester_name_manifest(plan uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ DECLARE j record;n integer;counts jsonb:='{}'::jsonb;BEGIN
 SELECT p.id,p.requester_id INTO j FROM public.privacy_redaction_apply_source s JOIN public.privacy_redaction_job p ON p.id=s.job_id WHERE s.job_id=plan AND s.source_xid=pg_current_xact_id_if_assigned() AND p.executor_role=public.scoped_redaction_caller() AND p.state='INTENT_VERIFIED';IF NOT FOUND THEN RAISE EXCEPTION 'Guarded name manifest required';END IF;
 UPDATE public.purchase_order o SET snapshot=jsonb_set(o.snapshot,'{submittedByDisplayName}','"[redacted]"'::jsonb,false) WHERE o.submitted_by=j.requester_id AND o.id IN(SELECT(i.identity->>'id')::uuid FROM public.privacy_redaction_apply_item i WHERE i.job_id=j.id AND i.family='purchase_order') AND to_jsonb(o) IS DISTINCT FROM public.redacted_name_projection('purchase_order',to_jsonb(o),j.requester_id);GET DIAGNOSTICS n=ROW_COUNT;counts:=counts||jsonb_build_object('purchase_order',n);
 UPDATE public.purchase_order_event o SET actor_display_name=CASE WHEN o.actor_id=j.requester_id THEN '[redacted]' ELSE o.actor_display_name END,result=CASE WHEN o.result->>'submittedByAccountId'=j.requester_id::text THEN jsonb_set(o.result,'{submittedByDisplayName}','"[redacted]"'::jsonb,false) ELSE o.result END WHERE o.id IN(SELECT(i.identity->>'id')::uuid FROM public.privacy_redaction_apply_item i WHERE i.job_id=j.id AND i.family='purchase_order_event') AND to_jsonb(o) IS DISTINCT FROM public.redacted_name_projection('purchase_order_event',to_jsonb(o),j.requester_id);GET DIAGNOSTICS n=ROW_COUNT;counts:=counts||jsonb_build_object('purchase_order_event',n);
 UPDATE public.order_submission_replay o SET original_result=jsonb_set(o.original_result,'{submittedByDisplayName}','"[redacted]"'::jsonb,false) WHERE o.actor_id=j.requester_id AND o.order_id IN(SELECT(i.identity->>'order_id')::uuid FROM public.privacy_redaction_apply_item i WHERE i.job_id=j.id AND i.family='order_submission_replay') AND to_jsonb(o) IS DISTINCT FROM public.redacted_name_projection('order_submission_replay',to_jsonb(o),j.requester_id);GET DIAGNOSTICS n=ROW_COUNT;counts:=counts||jsonb_build_object('order_submission_replay',n);
 UPDATE public.order_stage_assignment o SET result=jsonb_set(o.result,'{submittedByDisplayName}','"[redacted]"'::jsonb,false) WHERE o.order_id IN(SELECT(i.entry->>'orderId')::uuid FROM public.privacy_redaction_apply_item i WHERE i.job_id=j.id AND i.family='order_stage_assignment') AND EXISTS(SELECT 1 FROM public.privacy_redaction_apply_item i WHERE i.job_id=j.id AND i.family='order_stage_assignment' AND i.identity=jsonb_build_object('order_id',o.order_id,'expected_revision',o.expected_revision,'payload',o.payload)) AND to_jsonb(o) IS DISTINCT FROM public.redacted_name_projection('order_stage_assignment',to_jsonb(o),j.requester_id);GET DIAGNOSTICS n=ROW_COUNT;counts:=counts||jsonb_build_object('order_stage_assignment',n);
 UPDATE public.order_message o SET author_display_name='[redacted]' WHERE o.author_id=j.requester_id AND o.id IN(SELECT(i.identity->>'id')::uuid FROM public.privacy_redaction_apply_item i WHERE i.job_id=j.id AND i.family='order_message') AND to_jsonb(o) IS DISTINCT FROM public.redacted_name_projection('order_message',to_jsonb(o),j.requester_id);GET DIAGNOSTICS n=ROW_COUNT;counts:=counts||jsonb_build_object('order_message',n);
 UPDATE public.message_replay o SET original_result=jsonb_set(o.original_result,'{authorDisplayName}','"[redacted]"'::jsonb,false) WHERE o.actor_id=j.requester_id AND o.message_id IN(SELECT(i.identity->>'message_id')::uuid FROM public.privacy_redaction_apply_item i WHERE i.job_id=j.id AND i.family='message_replay') AND to_jsonb(o) IS DISTINCT FROM public.redacted_name_projection('message_replay',to_jsonb(o),j.requester_id);GET DIAGNOSTICS n=ROW_COUNT;counts:=counts||jsonb_build_object('message_replay',n);
 RETURN counts;
END $$;
REVOKE ALL ON FUNCTION apply_requester_name_manifest(uuid) FROM PUBLIC;
CREATE FUNCTION scoped_redaction_intent(uuid,uuid,integer,uuid,text,uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb,text,jsonb) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN $14='ACCOUNT_DISPLAY_NAME_V1' AND $15='[]'::jsonb THEN public.scoped_redaction_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
 ELSE convert_to((convert_from(public.scoped_redaction_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13),'UTF8')::jsonb||jsonb_build_object('scopePolicy',$14,'fieldAction','PSEUDONYMIZE_REQUESTER_NAMES','sourceManifest',$15))::text,'UTF8') END
$$;
CREATE FUNCTION scoped_redaction_completion(uuid,uuid,integer,uuid,text,uuid,uuid,text,timestamptz,bigint,boolean,text,text,jsonb) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN $13='ACCOUNT_DISPLAY_NAME_V1' THEN public.scoped_redaction_completion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
 ELSE convert_to((convert_from(public.scoped_redaction_completion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12),'UTF8')::jsonb||jsonb_build_object('scopePolicy',$13,'affectedCounts',$14))::text,'UTF8') END
$$;

CREATE OR REPLACE FUNCTION protect_scoped_redaction_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_redaction_job'::regclass OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Original scoped redaction retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_xid<>pg_current_xact_id() OR NEW.revision<>1 OR NEW.state<>'APPROVED' OR NEW.created_at<>NEW.updated_at OR NEW.intent_body IS DISTINCT FROM public.scoped_redaction_intent(NEW.id,NEW.case_id,NEW.generation,NEW.organization_id,NEW.country,NEW.requester_id,NEW.expected_profile_revision,NEW.creator_id,NEW.qualification_revision,NEW.review_access_id,NEW.approval_audit_id,NEW.created_at,NEW.review_references,NEW.scope_policy,NEW.source_manifest)
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
 AND(to_jsonb(NEW)-ARRAY['revision','updated_at','state','outcome','resolution_actor','resolution_audit_id','resolution_from_revision','resolved_at','resolution_xid','profile_revision_after','field_changed','completion_body','affected_counts'])=(to_jsonb(OLD)-ARRAY['revision','updated_at','state','outcome','resolution_actor','resolution_audit_id','resolution_from_revision','resolved_at','resolution_xid','profile_revision_after','field_changed','completion_body','affected_counts'])
 AND(NEW.scope_policy='ACCOUNT_DISPLAY_NAME_V1' OR EXISTS(SELECT 1 FROM public.privacy_redaction_apply_source s WHERE s.job_id=NEW.id AND s.source_xid=pg_current_xact_id_if_assigned()))
 AND EXISTS(SELECT 1 FROM public.account_identity a JOIN public.audit_event e ON e.id=NEW.resolution_audit_id WHERE a.id=OLD.requester_id AND a.display_name='[redacted]' AND a.revision=NEW.profile_revision_after AND e.actor_id=NEW.creator_id AND e.action='PRIVACY_REDACTION_APPLIED' AND e.resource_id=NEW.id AND e.occurred_at=NEW.resolved_at AND e.target_organization_id=NEW.organization_id AND e.target_country=NEW.country) THEN RETURN NEW;END IF;
 IF OLD.state IN('APPLIED','CANCELLED') AND NEW.state='COMPLETED' AND OLD.executor_role=public.scoped_redaction_caller() AND OLD.resolution_xid IS DISTINCT FROM pg_current_xact_id_if_assigned()
 AND(to_jsonb(NEW)-ARRAY['revision','updated_at','state','completion_sha256','completion_bytes','completion_key_version','completed_at'])=(to_jsonb(OLD)-ARRAY['revision','updated_at','state','completion_sha256','completion_bytes','completion_key_version','completed_at']) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Invalid scoped redaction transition';
END $$;

CREATE OR REPLACE FUNCTION prepare_scoped_redaction(p_plan uuid,p_access uuid,p_nonce bytea,p_actor uuid,p_session uuid,p_transport text,p_expected_revision bigint,p_refs jsonb,p_digest bytea,p_original jsonb,p_audit uuid,p_request uuid,p_at timestamptz,p_scope text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$
DECLARE c record;previous public.privacy_redaction_job%ROWTYPE;policy public.privacy_redaction_executor%ROWTYPE;subject public.account_identity%ROWTYPE;membership public.business_account%ROWTYPE;proof public.privacy_review_access%ROWTYPE;authentication public.application_session%ROWTYPE;counter bigint;sequence integer;body bytea;manifest jsonb:='[]'::jsonb;
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
 IF p_scope NOT IN('ACCOUNT_DISPLAY_NAME_V1','REQUESTER_NAMES_V1') OR p_scope IS NULL THEN RETURN 'INVALID_SCOPE';END IF;
 IF p_scope='REQUESTER_NAMES_V1' THEN manifest:=public.requester_name_manifest(c.requester_id,c.organization_id);IF jsonb_array_length(manifest)>100000 THEN RETURN 'REDACTION_TOO_LARGE';END IF;END IF;
 body:=public.scoped_redaction_intent(p_plan,c.id,sequence,c.organization_id,c.country,c.requester_id,subject.revision,p_actor,proof.qualification_revision,p_access,p_audit,p_at,p_refs,p_scope,manifest);
 IF octet_length(body)>16777216 THEN RETURN 'REDACTION_TOO_LARGE';END IF;
 INSERT INTO public.audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,reason,changed_fields,target_organization_id,target_country)
 VALUES(p_audit,'PLATFORM_ADMIN',p_actor,'PRIVACY_REDACTION_APPROVED','PRIVACY_REDACTION',p_plan,'SUCCESS',p_request,p_at,proof.reason,ARRAY['scopedRedaction'],c.organization_id,c.country);
 INSERT INTO public.privacy_redaction_job(scope_policy,source_manifest,id,case_id,organization_id,country,requester_id,generation,expected_profile_revision,executor_policy_revision,executor_role,environment_code,configuration_reference,creator_id,session_id,transport,qualification_revision,security_epoch,credential_generation,session_token_hash,auth_at,approval_expires_at,review_access_id,approval_audit_id,review_references,approval_digest,original_response,created_at,updated_at,intent_body,intent_plain_digest)
 VALUES(p_scope,manifest,p_plan,c.id,c.organization_id,c.country,c.requester_id,sequence,subject.revision,policy.revision,policy.role_oid,policy.environment_code,policy.configuration_reference,p_actor,p_session,p_transport,proof.qualification_revision,proof.security_epoch,proof.credential_generation,proof.session_token_hash,authentication.auth_at,least(p_at+interval '60 seconds',authentication.auth_at+interval '300 seconds'),p_access,p_audit,p_refs,p_digest,p_original,p_at,p_at,body,sha256(body));RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION prepare_scoped_redaction(uuid,uuid,bytea,uuid,uuid,text,bigint,jsonb,bytea,jsonb,uuid,uuid,timestamptz,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION prepare_scoped_redaction(p_plan uuid,p_access uuid,p_nonce bytea,p_actor uuid,p_session uuid,p_transport text,p_expected_revision bigint,p_refs jsonb,p_digest bytea,p_original jsonb,p_audit uuid,p_request uuid,p_at timestamptz)
 RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$ SELECT public.prepare_scoped_redaction(p_plan,p_access,p_nonce,p_actor,p_session,p_transport,p_expected_revision,p_refs,p_digest,p_original,p_audit,p_request,p_at,'ACCOUNT_DISPLAY_NAME_V1') $$;

CREATE OR REPLACE FUNCTION acknowledge_scoped_redaction(p_plan uuid,p_kind text,p_digest text,p_bytes integer,p_key_version text,p_at timestamptz)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ DECLARE job public.privacy_redaction_job%ROWTYPE;body bytea;BEGIN
 SELECT * INTO job FROM public.privacy_redaction_job WHERE id=p_plan AND executor_role=public.scoped_redaction_caller() AND created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() FOR UPDATE;
 IF NOT FOUND THEN RETURN 'NOT_FOUND';END IF;
 IF p_digest IS NULL OR p_digest!~'^[0-9a-f]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 37 AND 16777344 OR p_key_version IS NULL OR p_key_version!~'^v[1-9][0-9]{0,5}$' THEN RETURN 'EVIDENCE_CONFLICT';END IF;
 IF p_kind='INTENT' THEN
  IF job.intent_sha256 IS NOT NULL THEN IF(job.intent_sha256,job.intent_bytes,job.intent_key_version) IS NOT DISTINCT FROM(p_digest,p_bytes,p_key_version) THEN RETURN 'OK';ELSE RETURN 'EVIDENCE_CONFLICT';END IF;END IF;
  IF job.state NOT IN('APPROVED','CANCELLED') THEN RETURN 'INVALID_STATE';END IF;
  IF job.state='CANCELLED' THEN body:=public.scoped_redaction_completion(job.id,job.case_id,job.generation,job.organization_id,job.country,job.resolution_actor,job.resolution_audit_id,job.outcome,job.resolved_at,job.profile_revision_after,job.field_changed,p_digest,job.scope_policy,job.affected_counts);END IF;
  UPDATE public.privacy_redaction_job SET state=CASE WHEN state='APPROVED' THEN 'INTENT_VERIFIED' ELSE state END,revision=revision+1,updated_at=p_at,intent_sha256=p_digest,intent_bytes=p_bytes,intent_key_version=p_key_version,completion_body=body WHERE id=p_plan;RETURN 'OK';
 ELSIF p_kind='COMPLETION' THEN
  IF job.state='COMPLETED' THEN IF(job.completion_sha256,job.completion_bytes,job.completion_key_version) IS NOT DISTINCT FROM(p_digest,p_bytes,p_key_version) THEN RETURN 'OK';ELSE RETURN 'EVIDENCE_CONFLICT';END IF;END IF;
  IF job.state NOT IN('APPLIED','CANCELLED') OR job.completion_body IS NULL OR job.resolution_xid IS NOT DISTINCT FROM pg_current_xact_id_if_assigned() THEN RETURN 'SOURCE_NOT_COMMITTED';END IF;
  UPDATE public.privacy_redaction_job SET state='COMPLETED',revision=revision+1,updated_at=p_at,completion_sha256=p_digest,completion_bytes=p_bytes,completion_key_version=p_key_version,completed_at=p_at WHERE id=p_plan;RETURN 'OK';
 END IF;RETURN 'INVALID_STATE';
END $$;

CREATE OR REPLACE FUNCTION apply_scoped_redaction(p_plan uuid,p_audit uuid,p_request uuid,p_at timestamptz)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET TimeZone='UTC' AS $$
DECLARE job public.privacy_redaction_job%ROWTYPE;subject public.account_identity%ROWTYPE;membership public.business_account%ROWTYPE;changed boolean;after_revision bigint;affected integer;body bytea;counts jsonb;
BEGIN
 SELECT * INTO job FROM public.privacy_redaction_job WHERE id=p_plan AND executor_role=public.scoped_redaction_caller() AND created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned();IF NOT FOUND THEN RETURN 'NOT_FOUND';END IF;
 IF job.state IN('APPLIED','CANCELLED','COMPLETED') THEN RETURN 'RESOLVED';END IF;
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
 IF job.scope_policy='REQUESTER_NAMES_V1' THEN
  IF job.source_manifest IS DISTINCT FROM public.requester_name_manifest(job.requester_id,job.organization_id) THEN RETURN 'STALE_PLAN';END IF;
  INSERT INTO public.privacy_redaction_apply_source VALUES(job.id,pg_current_xact_id(),p_at,jsonb_array_length(job.source_manifest));
  counts:=public.apply_requester_name_manifest(job.id);
 END IF;
 changed:=subject.display_name IS DISTINCT FROM '[redacted]' OR coalesce((SELECT sum(value::bigint) FROM jsonb_each_text(counts)),0)>0;
 UPDATE public.account_identity SET display_name='[redacted]',revision=revision+1,updated_at=p_at WHERE id=job.requester_id AND changed;GET DIAGNOSTICS affected=ROW_COUNT;changed:=affected=1;after_revision:=subject.revision+affected;
 IF counts IS NOT NULL THEN counts:=counts||jsonb_build_object('account_identity',affected);END IF;
 INSERT INTO public.audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,target_organization_id,target_country)
 VALUES(p_audit,'PLATFORM_ADMIN',job.creator_id,'PRIVACY_REDACTION_APPLIED','PRIVACY_REDACTION',job.id,'SUCCESS',p_request,p_at,ARRAY['scopedRedaction'],job.organization_id,job.country);
 body:=public.scoped_redaction_completion(job.id,job.case_id,job.generation,job.organization_id,job.country,job.creator_id,p_audit,'APPLIED',p_at,after_revision,changed,job.intent_sha256,job.scope_policy,counts);
 UPDATE public.privacy_redaction_job SET state='APPLIED',revision=revision+1,updated_at=p_at,outcome='APPLIED',resolution_actor=creator_id,resolution_audit_id=p_audit,resolution_from_revision=revision,resolved_at=p_at,resolution_xid=pg_current_xact_id(),profile_revision_after=after_revision,field_changed=changed,affected_counts=counts,completion_body=body WHERE id=p_plan;RETURN 'OK';
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
 IF job.intent_sha256 IS NOT NULL THEN body:=public.scoped_redaction_completion(job.id,job.case_id,job.generation,job.organization_id,job.country,p_actor,p_audit,'CANCELLED',p_at,NULL,NULL,job.intent_sha256,job.scope_policy,job.affected_counts);END IF;
 UPDATE public.privacy_redaction_job SET state='CANCELLED',revision=revision+1,updated_at=p_at,outcome='CANCELLED',resolution_actor=p_actor,resolution_audit_id=p_audit,resolution_from_revision=revision,resolved_at=p_at,resolution_xid=pg_current_xact_id(),cancel_digest=p_digest,cancel_response=p_response,completion_body=body WHERE id=p_plan;RETURN 'OK';
END $$;

CREATE FUNCTION valid_redaction_counts(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(value)='object' AND value ?& ARRAY['account_identity','purchase_order','purchase_order_event','order_submission_replay','order_stage_assignment','order_message','message_replay'] AND(SELECT count(*) FROM jsonb_object_keys(value))=7 AND NOT EXISTS(SELECT 1 FROM jsonb_each_text(value) e WHERE e.value!~'^[0-9]{1,6}$' OR e.value::bigint>100000) AND(value->>'account_identity')::integer BETWEEN 0 AND 1,false)
$$;
ALTER TABLE privacy_redaction_job ADD CONSTRAINT ck_redaction_affected_counts CHECK((scope_policy='ACCOUNT_DISPLAY_NAME_V1' AND affected_counts IS NULL) OR(scope_policy='REQUESTER_NAMES_V1' AND((outcome IS DISTINCT FROM 'APPLIED' AND affected_counts IS NULL) OR(outcome='APPLIED' AND valid_redaction_counts(affected_counts)))));
CREATE OR REPLACE VIEW privacy_redaction_worker_work AS SELECT id,case_id,organization_id,country,requester_id,generation,scope_policy,expected_profile_revision,executor_policy_revision,environment_code,configuration_reference,revision,state,outcome,created_at,approval_expires_at,intent_body,intent_sha256,intent_bytes,intent_key_version,completion_sha256,completion_bytes,completion_key_version,
 CASE WHEN resolution_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() THEN completion_body ELSE NULL END AS completion_body,source_manifest,affected_counts
 FROM privacy_redaction_job WHERE executor_role=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned();
UPDATE backend_schema_version SET version=76 WHERE id=1;
