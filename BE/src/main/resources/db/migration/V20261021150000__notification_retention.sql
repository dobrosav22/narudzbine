-- Disposable notification content/metadata; original source/replay identities remain.
ALTER TABLE inbox_work ADD COLUMN retired boolean NOT NULL DEFAULT false;
ALTER TABLE inbox_work ALTER COLUMN organization_name DROP NOT NULL;
ALTER TABLE inbox_work ALTER COLUMN order_reference DROP NOT NULL;
ALTER TABLE inbox_work ADD CONSTRAINT ck_inbox_retired_text CHECK(
 (retired AND organization_name IS NULL AND order_reference IS NULL) OR(NOT retired AND organization_name IS NOT NULL AND order_reference IS NOT NULL));
CREATE OR REPLACE FUNCTION protect_inbox_work() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' AND NEW.retired THEN RAISE EXCEPTION 'Initial inbox work cannot be retired';END IF;
 IF TG_OP='UPDATE' AND NOT OLD.retired AND NEW.retired AND OLD.state IN('PUBLISHED','SUPPRESSED','EXPIRED') AND NEW.organization_name IS NULL AND NEW.order_reference IS NULL
  AND(to_jsonb(NEW)-ARRAY['retired','organization_name','order_reference'])=(to_jsonb(OLD)-ARRAY['retired','organization_name','order_reference']) THEN RETURN NEW;END IF;

 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inbox work retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUEUED' OR NOT EXISTS(SELECT 1 FROM inbox_source s WHERE s.id=NEW.id AND (s.source_kind,s.recipient_account_id,s.organization_id,s.locale,s.created_at,s.order_id,s.event_key,s.actor_id,s.mandatory,s.organization_name,s.order_reference) IS NOT DISTINCT FROM (NEW.source_kind,NEW.recipient_account_id,NEW.organization_id,NEW.locale,NEW.created_at,NEW.order_id,NEW.event_key,NEW.actor_id,NEW.mandatory,NEW.organization_name,NEW.order_reference)) THEN RAISE EXCEPTION 'Invalid inbox source';END IF;
 ELSIF (to_jsonb(NEW)-'state'-'completed_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'completed_at') OR OLD.state<>'QUEUED' OR NEW.state='QUEUED' THEN RAISE EXCEPTION 'Inbox work immutable';END IF;RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION protect_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN IF EXISTS(SELECT 1 FROM public.inbox_work w WHERE w.id=OLD.id AND w.state='PUBLISHED' AND w.retired) THEN RETURN OLD;END IF;RAISE EXCEPTION 'Inbox retirement required before deletion';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.read OR NOT EXISTS(SELECT 1 FROM inbox_work w WHERE w.id=NEW.id AND w.state='QUEUED' AND (w.recipient_account_id,w.organization_id,w.event_key,w.order_id,w.created_at) IS NOT DISTINCT FROM (NEW.recipient_account_id,NEW.organization_id,NEW.event_key,NEW.order_id,NEW.created_at)) THEN RAISE EXCEPTION 'Notification source differs';END IF;
 ELSIF (to_jsonb(NEW)-'read') IS DISTINCT FROM (to_jsonb(OLD)-'read') OR NOT NEW.read THEN RAISE EXCEPTION 'Notification immutable';END IF;RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION require_inbox_publication() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;BEGIN
 target=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 IF EXISTS(SELECT 1 FROM public.inbox_work w WHERE w.id=target AND((w.state='PUBLISHED' AND NOT w.retired) IS DISTINCT FROM EXISTS(SELECT 1 FROM public.notification n WHERE n.id=target))) THEN RAISE EXCEPTION 'Inbox publication incomplete';END IF;RETURN NULL;
END $$;
DROP TRIGGER ct_notification_publication ON notification;
CREATE CONSTRAINT TRIGGER ct_notification_publication AFTER INSERT OR DELETE ON notification DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_inbox_publication();
ALTER TABLE external_job ADD COLUMN metadata_retired boolean NOT NULL DEFAULT false;
ALTER TABLE external_job ALTER COLUMN attempts DROP NOT NULL;
ALTER TABLE external_job ALTER COLUMN next_attempt_at DROP NOT NULL;
ALTER TABLE external_job ADD CONSTRAINT ck_delivery_retired_metadata CHECK(
 (metadata_retired AND attempts IS NULL AND next_attempt_at IS NULL AND first_attempt_at IS NULL AND rendered_destination IS NULL AND attempted_device_revision IS NULL AND attempted_token_hash IS NULL AND provider_reference IS NULL AND rendered_body IS NULL)
 OR(NOT metadata_retired AND attempts IS NOT NULL AND next_attempt_at IS NOT NULL));
CREATE OR REPLACE FUNCTION protect_external_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN IF NEW.metadata_retired THEN RAISE EXCEPTION 'Initial delivery metadata required';END IF;RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND NOT OLD.metadata_retired AND NEW.metadata_retired AND OLD.state IN('DELIVERED','FAILED','SUPPRESSED','EXPIRED') AND OLD.rendered_body IS NULL
  AND NEW.attempts IS NULL AND NEW.next_attempt_at IS NULL AND NEW.first_attempt_at IS NULL AND NEW.rendered_destination IS NULL AND NEW.attempted_device_revision IS NULL AND NEW.attempted_token_hash IS NULL AND NEW.provider_reference IS NULL
  AND(to_jsonb(NEW)-ARRAY['metadata_retired','attempts','next_attempt_at','first_attempt_at','rendered_destination','attempted_device_revision','attempted_token_hash','provider_reference'])=(to_jsonb(OLD)-ARRAY['metadata_retired','attempts','next_attempt_at','first_attempt_at','rendered_destination','attempted_device_revision','attempted_token_hash','provider_reference']) THEN RETURN NEW;END IF;
 IF NEW.metadata_retired IS DISTINCT FROM OLD.metadata_retired THEN RAISE EXCEPTION 'Invalid delivery metadata retirement';END IF;

 IF TG_OP='UPDATE' AND OLD.rendered_body IS NOT NULL AND NEW.rendered_body IS NULL THEN
  IF OLD.state NOT IN('ACCEPTED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED','EXPIRED') OR (to_jsonb(NEW)-'rendered_body') IS DISTINCT FROM (to_jsonb(OLD)-'rendered_body') THEN RAISE EXCEPTION 'Invalid delivery body compaction';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.rendered_body IS NULL AND NEW.rendered_body IS NOT NULL AND OLD.state NOT IN('QUEUED','SENDING') THEN RAISE EXCEPTION 'Terminal delivery body cannot be restored';END IF;
 IF TG_OP='DELETE' OR (NEW.id,NEW.source_kind,NEW.source_id,NEW.channel,NEW.device_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.source_kind,OLD.source_id,OLD.channel,OLD.device_id,OLD.created_at)
 OR NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1 OR (OLD.rendered_body IS NOT NULL AND NEW.rendered_body IS NOT NULL AND (NEW.rendered_body,NEW.rendered_destination) IS DISTINCT FROM (OLD.rendered_body,OLD.rendered_destination))
 OR (OLD.state IN('DELIVERED','FAILED','SUPPRESSED','EXPIRED') AND (to_jsonb(NEW)-'rendered_body') IS DISTINCT FROM (to_jsonb(OLD)-'rendered_body')) THEN RAISE EXCEPTION 'Invalid external job transition';END IF;RETURN NEW;END $$;
DROP TRIGGER tr_external_job ON external_job;
CREATE TRIGGER tr_external_job BEFORE INSERT OR UPDATE OR DELETE ON external_job FOR EACH ROW EXECUTE FUNCTION protect_external_job();
ALTER TABLE email_callback ADD COLUMN metadata_retired boolean NOT NULL DEFAULT false;
ALTER TABLE email_callback ALTER COLUMN provider_reference DROP NOT NULL;
ALTER TABLE email_callback ALTER COLUMN event_type DROP NOT NULL;
ALTER TABLE email_callback ALTER COLUMN received_at DROP NOT NULL;
ALTER TABLE email_callback ADD CONSTRAINT ck_callback_retired_metadata CHECK(
 (metadata_retired AND provider_reference IS NULL AND event_type IS NULL AND received_at IS NULL)
 OR(NOT metadata_retired AND provider_reference IS NOT NULL AND event_type IS NOT NULL AND received_at IS NOT NULL));
CREATE FUNCTION protect_callback_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='INSERT' THEN IF NEW.metadata_retired THEN RAISE EXCEPTION 'Initial callback metadata required';END IF;RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND NOT OLD.metadata_retired AND NEW.metadata_retired AND NEW.provider_reference IS NULL AND NEW.event_type IS NULL AND NEW.received_at IS NULL
  AND(to_jsonb(NEW)-ARRAY['metadata_retired','provider_reference','event_type','received_at'])=(to_jsonb(OLD)-ARRAY['metadata_retired','provider_reference','event_type','received_at']) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Callback replay identity retained';
END $$;
DROP TRIGGER tr_email_callback ON email_callback;
CREATE TRIGGER tr_email_callback BEFORE INSERT OR UPDATE OR DELETE ON email_callback FOR EACH ROW EXECUTE FUNCTION protect_callback_identity();
CREATE INDEX ix_inbox_work_retention ON inbox_work(created_at,id) WHERE NOT retired AND state IN('PUBLISHED','SUPPRESSED','EXPIRED');
CREATE INDEX ix_external_job_metadata_retention ON external_job(terminal_at,id) WHERE NOT metadata_retired AND state IN('DELIVERED','FAILED','SUPPRESSED','EXPIRED');
CREATE INDEX ix_external_job_unmapped_uncertainty ON external_job(channel,state) WHERE provider_reference IS NULL AND state IN('SENDING','ACCEPTED','UNKNOWN');
CREATE INDEX ix_callback_metadata_retention ON email_callback(received_at,id) WHERE NOT metadata_retired;
UPDATE backend_schema_version SET version=67 WHERE id=1;
