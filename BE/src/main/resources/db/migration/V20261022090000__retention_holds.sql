-- Case-linked platform evidence retention holds. Unreleased schema69.
CREATE TABLE retention_hold(
 id uuid PRIMARY KEY REFERENCES audit_event(id),case_id uuid NOT NULL,organization_id uuid NOT NULL,country varchar(2) NOT NULL,
 policy varchar(40) NOT NULL DEFAULT 'PLATFORM_EVIDENCE_V1' CHECK(policy='PLATFORM_EVIDENCE_V1'),
 state varchar(8) NOT NULL DEFAULT 'ACTIVE' CHECK(state IN('ACTIVE','RELEASED')),revision bigint NOT NULL DEFAULT 1,
 creator_id uuid NOT NULL REFERENCES privacy_operator(account_id),created_session uuid NOT NULL,created_transport varchar(7) NOT NULL CHECK(created_transport IN('BROWSER','NATIVE')),
 created_qualification bigint NOT NULL CHECK(created_qualification>0),created_at timestamptz(3) NOT NULL,creation_digest bytea NOT NULL CHECK(octet_length(creation_digest)=32),
 activation_reference text NOT NULL CHECK(char_length(activation_reference) BETWEEN 1 AND 100),original_response jsonb NOT NULL,
 release_audit_id uuid UNIQUE REFERENCES audit_event(id),released_by uuid REFERENCES privacy_operator(account_id),released_session uuid,released_transport varchar(7),released_qualification bigint,
 released_at timestamptz(3),release_digest bytea CHECK(octet_length(release_digest)=32),release_expected text,release_reference text,release_response jsonb,
 FOREIGN KEY(case_id,organization_id,country) REFERENCES privacy_case(id,organization_id,country),
 FOREIGN KEY(created_session,creator_id) REFERENCES application_session_identity(id,account_id),
 FOREIGN KEY(released_session,released_by) REFERENCES application_session_identity(id,account_id),
 CHECK((state='ACTIVE' AND revision=1 AND release_audit_id IS NULL AND released_by IS NULL AND released_session IS NULL AND released_transport IS NULL AND released_qualification IS NULL AND released_at IS NULL AND release_digest IS NULL AND release_expected IS NULL AND release_reference IS NULL AND release_response IS NULL)
 OR(state='RELEASED' AND revision=2 AND release_audit_id IS NOT NULL AND released_by IS NOT NULL AND released_session IS NOT NULL AND released_transport IN('BROWSER','NATIVE') AND released_qualification>0 AND released_at>=created_at AND release_digest IS NOT NULL AND length(release_expected)>0 AND char_length(release_reference) BETWEEN 1 AND 100 AND release_response IS NOT NULL))
);
CREATE INDEX ix_retention_hold_active ON retention_hold(id) WHERE state='ACTIVE';
-- Only global pause state is visible to connected technical roles. No private context/projection.
GRANT SELECT(state) ON retention_hold TO PUBLIC;
CREATE FUNCTION retention_preservation_active() RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('retention-hold/preservation/v1',0));
 RETURN EXISTS(SELECT 1 FROM public.retention_hold WHERE state='ACTIVE');
END $$;
CREATE TABLE media_disposal_claim(
 asset_id uuid NOT NULL REFERENCES media_asset(id),kind varchar(12) NOT NULL CHECK(kind IN('QUARANTINE','READY_RAW','PROCESSED')),
 created_at timestamptz(3) NOT NULL,completed_at timestamptz(3) CHECK(completed_at>=created_at),PRIMARY KEY(asset_id,kind)
);
CREATE FUNCTION guard_media_disposal_claim() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.media_disposal_claim'::regclass THEN RAISE EXCEPTION 'Original disposal source required';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.completed_at IS NOT NULL OR public.retention_preservation_active() THEN RAISE EXCEPTION 'Disposal is preserved';END IF;RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL AND(to_jsonb(NEW)-'completed_at')=(to_jsonb(OLD)-'completed_at')
 AND EXISTS(SELECT 1 FROM public.media_asset a LEFT JOIN public.media_upload u ON u.asset_id=a.id WHERE a.id=NEW.asset_id AND
 ((NEW.kind='PROCESSED' AND a.processed_deleted_at IS NOT NULL) OR(NEW.kind IN('READY_RAW','QUARANTINE') AND u.raw_deleted_at IS NOT NULL))) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Disposal claim evidence retained';
END $$;
REVOKE ALL ON FUNCTION guard_media_disposal_claim() FROM PUBLIC;
CREATE TRIGGER tr_media_disposal_claim BEFORE INSERT OR UPDATE OR DELETE ON media_disposal_claim FOR EACH ROW EXECUTE FUNCTION guard_media_disposal_claim();
CREATE FUNCTION claim_media_disposal(selected_asset uuid,selected_kind text,at_time timestamptz) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF selected_kind NOT IN('QUARANTINE','READY_RAW','PROCESSED') THEN RAISE EXCEPTION 'Invalid disposal kind';END IF;
 IF public.retention_preservation_active() THEN RETURN false;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.media_asset WHERE id=selected_asset AND state<>'DELETED') THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM public.media_disposal_claim WHERE asset_id=selected_asset AND kind<>selected_kind AND completed_at IS NULL) THEN RETURN false;END IF;
 INSERT INTO public.media_disposal_claim(asset_id,kind,created_at) VALUES(selected_asset,selected_kind,at_time) ON CONFLICT DO NOTHING;
 RETURN EXISTS(SELECT 1 FROM public.media_disposal_claim WHERE asset_id=selected_asset AND kind=selected_kind AND completed_at IS NULL);
END $$;
CREATE FUNCTION complete_media_disposal(selected_asset uuid,selected_kind text,at_time timestamptz) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 UPDATE public.media_disposal_claim SET completed_at=at_time WHERE asset_id=selected_asset AND kind=selected_kind AND completed_at IS NULL;
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.media_disposal_claim WHERE asset_id=selected_asset AND kind=selected_kind AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Disposal claim missing';END IF;
END $$;
REVOKE ALL ON FUNCTION claim_media_disposal(uuid,text,timestamptz),complete_media_disposal(uuid,text,timestamptz) FROM PUBLIC;
CREATE FUNCTION protect_retention_hold() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE selected_actor uuid;selected_session uuid;selected_transport text;selected_revision bigint;at_time timestamptz;selected_audit uuid;selected_action text;
BEGIN
 IF TG_RELID<>'public.retention_hold'::regclass OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Hold source retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'ACTIVE' OR NEW.revision<>1 OR NEW.original_response->>'id' IS DISTINCT FROM NEW.id::text OR NEW.original_response->>'state' IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'Initial active hold required';END IF;
  selected_actor=NEW.creator_id;selected_session=NEW.created_session;selected_transport=NEW.created_transport;selected_revision=NEW.created_qualification;at_time=NEW.created_at;selected_audit=NEW.id;selected_action='RETENTION_HOLD_ACTIVATED';
 ELSE
  IF OLD.state<>'ACTIVE' OR NEW.state<>'RELEASED' OR NEW.revision<>2 OR
  (to_jsonb(NEW)-ARRAY['state','revision','release_audit_id','released_by','released_session','released_transport','released_qualification','released_at','release_digest','release_expected','release_reference','release_response']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['state','revision','release_audit_id','released_by','released_session','released_transport','released_qualification','released_at','release_digest','release_expected','release_reference','release_response']) THEN RAISE EXCEPTION 'Invalid hold release';END IF;
  IF NEW.release_response->>'id' IS DISTINCT FROM NEW.id::text OR NEW.release_response->>'state' IS DISTINCT FROM 'RELEASED' THEN RAISE EXCEPTION 'Original release result required';END IF;
  selected_actor=NEW.released_by;selected_session=NEW.released_session;selected_transport=NEW.released_transport;selected_revision=NEW.released_qualification;at_time=NEW.released_at;selected_audit=NEW.release_audit_id;selected_action='RETENTION_HOLD_RELEASED';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.privacy_operator q JOIN public.account_identity a ON a.id=q.account_id JOIN public.application_session s ON s.account_id=a.id
 WHERE a.id=selected_actor AND s.id=selected_session AND q.enabled AND q.revision=selected_revision AND q.created_at<=at_time
 AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending
 AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation AND s.transport=selected_transport AND s.revoked_at IS NULL
 AND s.auth_at<=at_time AND at_time<s.auth_at+interval '300 seconds' AND at_time<s.absolute_expires_at AND at_time<s.last_qualified_activity_at+interval '30 minutes' FOR SHARE OF q,a,s) THEN RAISE EXCEPTION 'Current qualified operator required';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_event e WHERE e.id=selected_audit AND e.actor_type='PLATFORM_ADMIN' AND e.actor_id=selected_actor AND e.action=selected_action AND e.resource_type='RETENTION_HOLD' AND e.resource_id=NEW.id AND e.target_organization_id=NEW.organization_id AND e.target_country=NEW.country AND e.occurred_at=at_time AND length(btrim(e.reason))>0) THEN RAISE EXCEPTION 'Matching hold audit required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('retention-hold/preservation/v1',0));
 IF TG_OP='INSERT' AND (EXISTS(SELECT 1 FROM public.media_disposal_claim WHERE completed_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.media_asset a LEFT JOIN public.media_upload u ON u.asset_id=a.id WHERE a.cleanup_claimed_at IS NOT NULL AND
 ((a.ready_at IS NOT NULL AND a.processed_deleted_at IS NULL) OR(a.ready_at IS NULL AND u.raw_deleted_at IS NULL)))) THEN RAISE EXCEPTION 'HOLD_ACTIVATION_BLOCKED';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_retention_hold() FROM PUBLIC;
CREATE TRIGGER tr_retention_hold BEFORE INSERT OR UPDATE OR DELETE ON retention_hold FOR EACH ROW EXECUTE FUNCTION protect_retention_hold();
CREATE TRIGGER tr_retention_hold_no_truncate BEFORE TRUNCATE ON retention_hold FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION enforce_retention_preservation() RETURNS trigger LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>TG_ARGV[0] THEN RAISE EXCEPTION 'Original preservation source required';END IF;
 IF public.retention_preservation_active() THEN RAISE EXCEPTION 'RETENTION_PRESERVED';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION enforce_retention_preservation() FROM PUBLIC;
CREATE TRIGGER aa_preservation_contact_creation BEFORE UPDATE ON contact_creation FOR EACH ROW WHEN((OLD.original_snapshot IS NOT NULL AND NEW.original_snapshot IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('contact_creation');
CREATE TRIGGER aa_preservation_location_creation BEFORE UPDATE ON location_creation FOR EACH ROW WHEN((OLD.original_snapshot IS NOT NULL AND NEW.original_snapshot IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('location_creation');
CREATE TRIGGER aa_preservation_taxonomy_creation BEFORE UPDATE ON taxonomy_creation FOR EACH ROW WHEN((OLD.original_snapshot IS NOT NULL AND NEW.original_snapshot IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('taxonomy_creation');
CREATE TRIGGER aa_preservation_product_creation BEFORE UPDATE ON product_creation FOR EACH ROW WHEN((OLD.original_snapshot IS NOT NULL AND NEW.original_snapshot IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('product_creation');
CREATE TRIGGER aa_preservation_draft_creation BEFORE UPDATE ON draft_creation FOR EACH ROW WHEN((OLD.original_snapshot IS NOT NULL AND NEW.original_snapshot IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('draft_creation');
CREATE TRIGGER aa_preservation_promotion_creation BEFORE UPDATE ON promotion_creation FOR EACH ROW WHEN((OLD.original_snapshot IS NOT NULL AND NEW.original_snapshot IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('promotion_creation');
CREATE TRIGGER aa_preservation_stock_replay BEFORE UPDATE ON stock_replay FOR EACH ROW WHEN((OLD.original_result IS NOT NULL AND NEW.original_result IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('stock_replay');
CREATE TRIGGER aa_preservation_inventory_lifecycle_replay BEFORE UPDATE ON inventory_lifecycle_replay FOR EACH ROW WHEN((OLD.original_result IS NOT NULL AND NEW.original_result IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('inventory_lifecycle_replay');
CREATE TRIGGER aa_preservation_pricing_deactivation_replay BEFORE UPDATE ON pricing_deactivation_replay FOR EACH ROW WHEN((OLD.original_result IS NOT NULL AND NEW.original_result IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('pricing_deactivation_replay');
CREATE TRIGGER aa_preservation_message_replay BEFORE UPDATE ON message_replay FOR EACH ROW WHEN((OLD.original_result IS NOT NULL AND NEW.original_result IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('message_replay');
CREATE TRIGGER aa_preservation_order_submission_replay BEFORE UPDATE ON order_submission_replay FOR EACH ROW WHEN((OLD.original_result IS NOT NULL AND NEW.original_result IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('order_submission_replay');
CREATE TRIGGER aa_preservation_order_stage_creation BEFORE UPDATE ON order_stage_creation FOR EACH ROW WHEN((OLD.original_result IS NOT NULL AND NEW.original_result IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('order_stage_creation');
CREATE TRIGGER aa_preservation_privacy_case_creation BEFORE UPDATE ON privacy_case_creation FOR EACH ROW WHEN((OLD.original_response IS NOT NULL AND NEW.original_response IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('privacy_case_creation');
CREATE TRIGGER aa_preservation_commercial_export BEFORE UPDATE ON commercial_export FOR EACH ROW WHEN((OLD.original_response IS NOT NULL AND NEW.original_response IS NULL) OR (OLD.artifact IS NOT NULL AND NEW.artifact IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('commercial_export');
CREATE TRIGGER aa_preservation_catalogue_import_preview BEFORE UPDATE ON catalogue_import_preview FOR EACH ROW WHEN((OLD.rows IS NOT NULL AND NEW.rows IS NULL) OR (OLD.errors IS NOT NULL AND NEW.errors IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('catalogue_import_preview');
CREATE TRIGGER aa_preservation_password_reset_delivery BEFORE UPDATE ON password_reset_delivery FOR EACH ROW WHEN((OLD.encrypted_token IS NOT NULL AND NEW.encrypted_token IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('password_reset_delivery');
CREATE TRIGGER aa_preservation_email_change_delivery BEFORE UPDATE ON email_change_delivery FOR EACH ROW WHEN((OLD.encrypted_token IS NOT NULL AND NEW.encrypted_token IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('email_change_delivery');
CREATE TRIGGER aa_preservation_setup_delivery BEFORE UPDATE ON setup_delivery FOR EACH ROW WHEN((OLD.encrypted_token IS NOT NULL AND NEW.encrypted_token IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('setup_delivery');
CREATE TRIGGER aa_preservation_recovery_delivery BEFORE UPDATE ON recovery_delivery FOR EACH ROW WHEN((OLD.encrypted_token IS NOT NULL AND NEW.encrypted_token IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('recovery_delivery');
CREATE TRIGGER aa_preservation_password_reset_proof BEFORE UPDATE ON password_reset_proof FOR EACH ROW WHEN((OLD.token_hash IS NOT NULL AND NEW.token_hash IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('password_reset_proof');
CREATE TRIGGER aa_preservation_email_change_proof BEFORE UPDATE ON email_change_proof FOR EACH ROW WHEN((OLD.token_hash IS NOT NULL AND NEW.token_hash IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('email_change_proof');
CREATE TRIGGER aa_preservation_setup_email_proof BEFORE UPDATE ON setup_email_proof FOR EACH ROW WHEN((OLD.token_hash IS NOT NULL AND NEW.token_hash IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('setup_email_proof');
CREATE TRIGGER aa_preservation_device_verification BEFORE UPDATE ON device_verification FOR EACH ROW WHEN((OLD.code_hash IS NOT NULL AND NEW.code_hash IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('device_verification');
CREATE TRIGGER aa_preservation_external_challenge BEFORE UPDATE ON external_challenge FOR EACH ROW WHEN((OLD.encrypted_verifier IS NOT NULL AND NEW.encrypted_verifier IS NULL) OR (OLD.state_hash IS NOT NULL AND NEW.state_hash IS NULL) OR (OLD.browser_binding_hash IS NOT NULL AND NEW.browser_binding_hash IS NULL) OR (OLD.original_token_hash IS NOT NULL AND NEW.original_token_hash IS NULL) OR (OLD.native_challenge IS NOT NULL AND NEW.native_challenge IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('external_challenge');
CREATE TRIGGER aa_preservation_external_exchange BEFORE UPDATE ON external_exchange FOR EACH ROW WHEN((OLD.code_hash IS NOT NULL AND NEW.code_hash IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('external_exchange');
CREATE TRIGGER aa_preservation_recovery_case BEFORE UPDATE ON recovery_case FOR EACH ROW WHEN((OLD.token_hash IS NOT NULL AND NEW.token_hash IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('recovery_case');
CREATE TRIGGER aa_preservation_inbox_work BEFORE UPDATE ON inbox_work FOR EACH ROW WHEN((OLD.organization_name IS NOT NULL AND NEW.organization_name IS NULL) OR (OLD.order_reference IS NOT NULL AND NEW.order_reference IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('inbox_work');
CREATE TRIGGER aa_preservation_external_job BEFORE UPDATE ON external_job FOR EACH ROW WHEN((OLD.rendered_body IS NOT NULL AND NEW.rendered_body IS NULL) OR (OLD.provider_reference IS NOT NULL AND NEW.provider_reference IS NULL) OR (OLD.attempts IS NOT NULL AND NEW.attempts IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('external_job');
CREATE TRIGGER aa_preservation_email_callback BEFORE UPDATE ON email_callback FOR EACH ROW WHEN((OLD.provider_reference IS NOT NULL AND NEW.provider_reference IS NULL) OR (OLD.event_type IS NOT NULL AND NEW.event_type IS NULL) OR (OLD.received_at IS NOT NULL AND NEW.received_at IS NULL)) EXECUTE FUNCTION enforce_retention_preservation('email_callback');
CREATE TRIGGER aa_preservation_application_session BEFORE DELETE ON application_session FOR EACH ROW EXECUTE FUNCTION enforce_retention_preservation('application_session');
CREATE TRIGGER aa_preservation_order_review BEFORE DELETE ON order_review FOR EACH ROW EXECUTE FUNCTION enforce_retention_preservation('order_review');
CREATE TRIGGER aa_preservation_notification BEFORE DELETE ON notification FOR EACH ROW EXECUTE FUNCTION enforce_retention_preservation('notification');

CREATE TRIGGER aa_preservation_media_claim BEFORE UPDATE ON media_asset FOR EACH ROW WHEN(OLD.cleanup_claimed_at IS NULL AND NEW.cleanup_claimed_at IS NOT NULL) EXECUTE FUNCTION enforce_retention_preservation('media_asset');
CREATE TRIGGER aa_preservation_raw_delete BEFORE UPDATE ON media_upload FOR EACH ROW WHEN(OLD.raw_deleted_at IS NULL AND NEW.raw_deleted_at IS NOT NULL) EXECUTE FUNCTION enforce_retention_preservation('media_upload');
ALTER TABLE commercial_export ADD COLUMN artifact_held boolean NOT NULL DEFAULT false;
DO $$ DECLARE selected name;BEGIN
 SELECT conname INTO STRICT selected FROM pg_constraint WHERE conrelid='commercial_export'::regclass AND contype='c' AND pg_get_expr(conbin,conrelid) LIKE '%QUEUED%' AND pg_get_expr(conbin,conrelid) LIKE '%artifact%';
 EXECUTE format('ALTER TABLE commercial_export DROP CONSTRAINT %I',selected);
END $$;
ALTER TABLE commercial_export ADD CONSTRAINT ck_export_payload_shape CHECK(
(state='QUEUED' AND completed_at IS NULL AND expires_at IS NULL AND failure_code IS NULL AND artifact IS NULL AND digest IS NULL AND byte_count IS NULL AND row_count IS NULL AND NOT artifact_held)
OR(state='READY' AND completed_at IS NOT NULL AND expires_at=completed_at+interval '24 hours' AND expires_at IS NOT NULL AND failure_code IS NULL AND artifact IS NOT NULL AND digest IS NOT NULL AND octet_length(artifact)=byte_count+28 AND octet_length(digest)=32 AND byte_count IS NOT NULL AND row_count IS NOT NULL AND NOT artifact_held)
OR(state='FAILED' AND completed_at IS NOT NULL AND expires_at IS NULL AND failure_code IN('EXPORT_ROW_LIMIT','EXPORT_SIZE_LIMIT','EXPORT_CAPACITY_REACHED','REPORT_OVERFLOW','ACCESS_REVOKED') AND failure_code IS NOT NULL AND artifact IS NULL AND digest IS NULL AND byte_count IS NULL AND row_count IS NULL AND NOT artifact_held)
OR(state='EXPIRED' AND expires_at IS NOT NULL AND failure_code IS NULL AND((NOT artifact_held AND artifact IS NULL AND digest IS NULL) OR(artifact_held AND completed_at IS NOT NULL AND artifact IS NOT NULL AND digest IS NOT NULL AND octet_length(artifact)=byte_count+28 AND octet_length(digest)=32 AND byte_count IS NOT NULL AND row_count IS NOT NULL))));
CREATE OR REPLACE FUNCTION guard_commercial_export() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Export identity retained';END IF;
 IF TG_OP='INSERT' AND NEW.artifact_held THEN RAISE EXCEPTION 'Initial export cannot be held';END IF;
 IF TG_OP='UPDATE' AND OLD.artifact_held AND NOT NEW.artifact_held AND OLD.state='EXPIRED' AND NEW.artifact IS NULL AND NEW.digest IS NULL AND(to_jsonb(NEW)-ARRAY['artifact_held','artifact','digest'])=(to_jsonb(OLD)-ARRAY['artifact_held','artifact','digest']) THEN
  IF public.retention_preservation_active() THEN RAISE EXCEPTION 'RETENTION_PRESERVED';END IF;RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW.artifact_held IS DISTINCT FROM OLD.artifact_held THEN
  IF NOT(NOT OLD.artifact_held AND NEW.artifact_held AND OLD.state='READY' AND NEW.state='EXPIRED' AND (NEW.artifact,NEW.digest) IS NOT DISTINCT FROM(OLD.artifact,OLD.digest) AND public.retention_preservation_active()) THEN RAISE EXCEPTION 'Invalid held artifact transition';END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.original_response IS NOT NULL AND NEW.original_response IS NULL AND (to_jsonb(NEW)-'original_response')=(to_jsonb(OLD)-'original_response') THEN RETURN NEW;END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUEUED' OR NEW.revision<>1 OR NEW.original_response->>'id' IS DISTINCT FROM NEW.id::text OR NEW.original_response->>'state' IS DISTINCT FROM 'QUEUED' OR NOT EXISTS(SELECT 1 FROM organization o JOIN business_account b ON b.organization_id=o.id JOIN account_identity a ON a.id=b.id WHERE o.id=NEW.organization_id AND o.country=NEW.country AND o.state='ACTIVE' AND b.id=NEW.requester_id AND a.state='ACTIVE' AND a.email_verified AND (NEW.kind<>'REPORT_BUYERS' OR o.type='VENDOR')) THEN RAISE EXCEPTION 'Invalid export source';END IF;
 ELSE
  IF (NEW.id,NEW.requester_id,NEW.organization_id,NEW.country,NEW.kind,NEW.from_date,NEW.to_date,NEW.original_response,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.requester_id,OLD.organization_id,OLD.country,OLD.kind,OLD.from_date,OLD.to_date,OLD.original_response,OLD.created_at) OR NEW.revision<>OLD.revision+1 OR NOT((OLD.state='QUEUED' AND NEW.state IN('READY','FAILED','EXPIRED')) OR(OLD.state='READY' AND NEW.state='EXPIRED')) THEN RAISE EXCEPTION 'Export identity or lifecycle immutable';END IF;
  IF OLD.state='READY' AND (NEW.completed_at,NEW.expires_at,NEW.byte_count,NEW.row_count) IS DISTINCT FROM (OLD.completed_at,OLD.expires_at,OLD.byte_count,OLD.row_count) THEN RAISE EXCEPTION 'Export metadata retained';END IF;
  IF OLD.state='QUEUED' AND NEW.state='EXPIRED' AND (NEW.expires_at IS DISTINCT FROM OLD.created_at+interval '24 hours' OR NEW.completed_at IS NOT NULL OR NEW.byte_count IS NOT NULL OR NEW.row_count IS NOT NULL) THEN RAISE EXCEPTION 'Invalid queue expiry';END IF;
 END IF;RETURN NEW;
END $$;

CREATE INDEX ix_export_held_artifact ON commercial_export(id) WHERE artifact_held;
DO $$ DECLARE previous text;BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR(resource_type=''RETENTION_HOLD'' AND actor_type=''PLATFORM_ADMIN'' AND target_organization_id IS NOT NULL AND action IN(''RETENTION_HOLD_ACTIVATED'',''RETENTION_HOLD_READ'',''RETENTION_HOLD_RELEASED'')))',previous);
END $$;
UPDATE backend_schema_version SET version=69 WHERE id=1;
