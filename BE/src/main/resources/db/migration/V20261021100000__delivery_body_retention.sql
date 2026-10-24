-- Rendered request cache only; no source/proof/job identity deletion.
CREATE OR REPLACE FUNCTION protect_external_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.rendered_body IS NOT NULL AND NEW.rendered_body IS NULL THEN
  IF OLD.state NOT IN('ACCEPTED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED','EXPIRED') OR (to_jsonb(NEW)-'rendered_body') IS DISTINCT FROM (to_jsonb(OLD)-'rendered_body') THEN RAISE EXCEPTION 'Invalid delivery body compaction';END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.rendered_body IS NULL AND NEW.rendered_body IS NOT NULL AND OLD.state NOT IN('QUEUED','SENDING') THEN RAISE EXCEPTION 'Terminal delivery body cannot be restored';END IF;
 IF TG_OP='DELETE' OR (NEW.id,NEW.source_kind,NEW.source_id,NEW.channel,NEW.device_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.source_kind,OLD.source_id,OLD.channel,OLD.device_id,OLD.created_at)
 OR NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1 OR (OLD.rendered_body IS NOT NULL AND NEW.rendered_body IS NOT NULL AND (NEW.rendered_body,NEW.rendered_destination) IS DISTINCT FROM (OLD.rendered_body,OLD.rendered_destination))
 OR (OLD.state IN('DELIVERED','FAILED','SUPPRESSED','EXPIRED') AND (to_jsonb(NEW)-'rendered_body') IS DISTINCT FROM (to_jsonb(OLD)-'rendered_body')) THEN RAISE EXCEPTION 'Invalid external job transition';END IF;RETURN NEW;END $$;
CREATE INDEX ix_external_job_body_retention ON external_job(terminal_at,id) WHERE rendered_body IS NOT NULL AND state IN('ACCEPTED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED','EXPIRED');
UPDATE backend_schema_version SET version=62 WHERE id=1;
