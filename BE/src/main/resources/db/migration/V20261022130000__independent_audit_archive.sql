-- Committed audit membership, not an unsafe occurredAt/UUID checkpoint.
CREATE TABLE audit_archive_policy(
 id uuid PRIMARY KEY,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),worker_role oid NOT NULL,
 enabled boolean NOT NULL DEFAULT true,configuration_reference text NOT NULL CHECK(char_length(configuration_reference) BETWEEN 1 AND 100 AND length(btrim(configuration_reference))>0),
 created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL CHECK(updated_at>=created_at)
);
CREATE UNIQUE INDEX uq_archive_enabled_role ON audit_archive_policy(worker_role) WHERE enabled;
CREATE TABLE audit_archive_policy_event(
 policy_id uuid NOT NULL REFERENCES audit_archive_policy(id),revision bigint NOT NULL,worker_role oid NOT NULL,enabled boolean NOT NULL,
 configuration_reference text NOT NULL,occurred_at timestamptz(3) NOT NULL,database_login name NOT NULL,effective_role name NOT NULL,
 PRIMARY KEY(policy_id,revision)
);
CREATE TRIGGER tr_archive_policy_event_retained BEFORE UPDATE OR DELETE ON audit_archive_policy_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_archive_policy_event_no_truncate BEFORE TRUNCATE ON audit_archive_policy_event FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION protect_archive_policy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_RELID<>'public.audit_archive_policy'::regclass THEN RAISE EXCEPTION 'Original archive policy required';END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive policy history retained';END IF;
 IF TG_OP='INSERT' THEN IF NEW.revision<>1 OR NEW.created_at<>NEW.updated_at THEN RAISE EXCEPTION 'Initial archive policy required';END IF;
 ELSIF NEW.id<>OLD.id OR NEW.worker_role<>OLD.worker_role OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at OR(NEW.enabled,NEW.configuration_reference) IS NOT DISTINCT FROM(OLD.enabled,OLD.configuration_reference) THEN RAISE EXCEPTION 'Invalid archive policy transition';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE oid=NEW.worker_role AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)) THEN RAISE EXCEPTION 'Restricted archive worker role required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_archive_policy BEFORE INSERT OR UPDATE OR DELETE ON audit_archive_policy FOR EACH ROW EXECUTE FUNCTION protect_archive_policy();
CREATE FUNCTION record_archive_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.audit_archive_policy'::regclass THEN RAISE EXCEPTION 'Original archive policy required';END IF;
 INSERT INTO public.audit_archive_policy_event(policy_id,revision,worker_role,enabled,configuration_reference,occurred_at,database_login,effective_role)
 VALUES(NEW.id,NEW.revision,NEW.worker_role,NEW.enabled,NEW.configuration_reference,NEW.updated_at,session_user,CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION record_archive_policy() FROM PUBLIC;
CREATE TRIGGER tr_archive_policy_record AFTER INSERT OR UPDATE ON audit_archive_policy FOR EACH ROW EXECUTE FUNCTION record_archive_policy();
CREATE TRIGGER tr_archive_policy_no_truncate BEFORE TRUNCATE ON audit_archive_policy FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();

CREATE TABLE audit_archive_spool(event_id uuid PRIMARY KEY REFERENCES audit_event(id),created_xid xid8 NOT NULL DEFAULT pg_current_xact_id());
INSERT INTO audit_archive_spool(event_id) SELECT id FROM audit_event;
CREATE FUNCTION spool_audit_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.audit_event'::regclass THEN RAISE EXCEPTION 'Original audit event required';END IF;
 INSERT INTO public.audit_archive_spool(event_id) VALUES(NEW.id);RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION spool_audit_event() FROM PUBLIC;
CREATE TRIGGER tr_audit_archive_source AFTER INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION spool_audit_event();
CREATE TRIGGER tr_archive_spool_retained BEFORE UPDATE OR DELETE ON audit_archive_spool FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_archive_spool_no_truncate BEFORE TRUNCATE ON audit_archive_spool FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();

CREATE TABLE audit_archive_run(
 id uuid PRIMARY KEY,created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),policy_id uuid NOT NULL,policy_revision bigint NOT NULL,archive_date date NOT NULL,cutoff timestamptz(3) NOT NULL,
 created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL,state varchar(16) NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','PART_VERIFIED','VERIFIED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),record_count integer NOT NULL CHECK(record_count BETWEEN 0 AND 250),
 part_sha256 varchar(64),part_bytes integer,part_key_version varchar(7),manifest_sha256 varchar(64),manifest_bytes integer,manifest_key_version varchar(7),
 FOREIGN KEY(policy_id,policy_revision) REFERENCES audit_archive_policy_event(policy_id,revision),
 CHECK(updated_at>=created_at AND archive_date=(created_at AT TIME ZONE 'UTC')::date AND cutoff=(archive_date::timestamp AT TIME ZONE 'UTC')),
 CHECK((state='PENDING' AND revision=1 AND part_sha256 IS NULL AND part_bytes IS NULL AND part_key_version IS NULL AND manifest_sha256 IS NULL AND manifest_bytes IS NULL AND manifest_key_version IS NULL)
 OR(state='PART_VERIFIED' AND revision=2 AND part_sha256 IS NOT NULL AND part_sha256~'^[0-9a-f]{64}$' AND part_bytes BETWEEN 37 AND 16777344 AND part_key_version~'^v[1-9][0-9]{0,5}$' AND part_bytes IS NOT NULL AND part_key_version IS NOT NULL AND manifest_sha256 IS NULL AND manifest_bytes IS NULL AND manifest_key_version IS NULL)
 OR(state='VERIFIED' AND revision=3 AND part_sha256 IS NOT NULL AND part_sha256~'^[0-9a-f]{64}$' AND part_bytes BETWEEN 37 AND 16777344 AND part_key_version~'^v[1-9][0-9]{0,5}$' AND part_bytes IS NOT NULL AND part_key_version IS NOT NULL AND manifest_sha256 IS NOT NULL AND manifest_sha256~'^[0-9a-f]{64}$' AND manifest_bytes BETWEEN 37 AND 16777344 AND manifest_key_version~'^v[1-9][0-9]{0,5}$' AND manifest_bytes IS NOT NULL AND manifest_key_version IS NOT NULL))
);
CREATE UNIQUE INDEX uq_archive_open_policy ON audit_archive_run(policy_id) WHERE state<>'VERIFIED';
CREATE INDEX ix_archive_run_date ON audit_archive_run(archive_date,created_at,id);
CREATE TABLE audit_archive_member(event_id uuid PRIMARY KEY REFERENCES audit_archive_spool(event_id),run_id uuid NOT NULL REFERENCES audit_archive_run(id));
CREATE INDEX ix_archive_member_run ON audit_archive_member(run_id,event_id);
CREATE TRIGGER tr_archive_member_retained BEFORE UPDATE OR DELETE ON audit_archive_member FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_archive_member_no_truncate BEFORE TRUNCATE ON audit_archive_member FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE TABLE audit_archive_run_event(run_id uuid NOT NULL REFERENCES audit_archive_run(id),revision bigint NOT NULL,state varchar(16) NOT NULL,occurred_at timestamptz(3) NOT NULL,database_login name NOT NULL,effective_role name NOT NULL,PRIMARY KEY(run_id,revision));
CREATE TRIGGER tr_archive_run_event_retained BEFORE UPDATE OR DELETE ON audit_archive_run_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_archive_run_event_no_truncate BEFORE TRUNCATE ON audit_archive_run_event FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();

CREATE FUNCTION archive_caller_role() RETURNS oid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT oid FROM pg_roles WHERE rolname=CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END
$$;
REVOKE ALL ON FUNCTION archive_caller_role() FROM PUBLIC;
CREATE FUNCTION protect_archive_run() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.audit_archive_run'::regclass OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Original archive run retained';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.audit_archive_policy_event p WHERE p.policy_id=NEW.policy_id AND p.revision=NEW.policy_revision AND p.worker_role=public.archive_caller_role()) THEN RAISE EXCEPTION 'Bound archive worker principal required';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_xid<>pg_current_xact_id() OR NEW.id::text!~'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR NEW.state<>'PENDING' OR NEW.revision<>1 OR NEW.created_at<>NEW.updated_at OR NOT EXISTS(SELECT 1 FROM public.audit_archive_policy p WHERE p.id=NEW.policy_id AND p.revision=NEW.policy_revision AND p.enabled AND p.updated_at<=NEW.created_at) THEN RAISE EXCEPTION 'Enabled current archive policy required';END IF;RETURN NEW;
 END IF;
 IF NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Archive receipt advances once';END IF;
 IF OLD.state='PENDING' AND NEW.state='PART_VERIFIED' AND(to_jsonb(NEW)-ARRAY['revision','state','updated_at','part_sha256','part_bytes','part_key_version'])=(to_jsonb(OLD)-ARRAY['revision','state','updated_at','part_sha256','part_bytes','part_key_version']) THEN RETURN NEW;END IF;
 IF OLD.state='PART_VERIFIED' AND NEW.state='VERIFIED' AND(to_jsonb(NEW)-ARRAY['revision','state','updated_at','manifest_sha256','manifest_bytes','manifest_key_version'])=(to_jsonb(OLD)-ARRAY['revision','state','updated_at','manifest_sha256','manifest_bytes','manifest_key_version']) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Invalid archive receipt transition';
END $$;
REVOKE ALL ON FUNCTION protect_archive_run() FROM PUBLIC;
CREATE TRIGGER tr_archive_run BEFORE INSERT OR UPDATE OR DELETE ON audit_archive_run FOR EACH ROW EXECUTE FUNCTION protect_archive_run();
CREATE TRIGGER tr_archive_run_no_truncate BEFORE TRUNCATE ON audit_archive_run FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION record_archive_run() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.audit_archive_run'::regclass THEN RAISE EXCEPTION 'Original archive run required';END IF;
 INSERT INTO public.audit_archive_run_event(run_id,revision,state,occurred_at,database_login,effective_role) VALUES(NEW.id,NEW.revision,NEW.state,NEW.updated_at,session_user,CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END);RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION record_archive_run() FROM PUBLIC;
CREATE TRIGGER tr_archive_run_record AFTER INSERT OR UPDATE ON audit_archive_run FOR EACH ROW EXECUTE FUNCTION record_archive_run();
CREATE FUNCTION verify_archive_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE run public.audit_archive_run%ROWTYPE;
BEGIN
 IF TG_RELID NOT IN('public.audit_archive_run'::regclass,'public.audit_archive_member'::regclass) THEN RAISE EXCEPTION 'Original archive membership required';END IF;
 IF TG_RELID='public.audit_archive_run'::regclass THEN SELECT * INTO STRICT run FROM public.audit_archive_run WHERE id=NEW.id;ELSE SELECT * INTO STRICT run FROM public.audit_archive_run WHERE id=NEW.run_id;END IF;
 IF run.record_count<>(SELECT count(*) FROM public.audit_archive_member WHERE run_id=run.id) OR EXISTS(SELECT 1 FROM public.audit_archive_member m JOIN public.audit_event e ON e.id=m.event_id WHERE m.run_id=run.id AND e.occurred_at>=run.cutoff) THEN RAISE EXCEPTION 'Complete eligible archive membership required';END IF;RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION verify_archive_membership() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER ct_archive_run_membership AFTER INSERT ON audit_archive_run DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_archive_membership();
CREATE CONSTRAINT TRIGGER ct_archive_member_membership AFTER INSERT ON audit_archive_member DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_archive_membership();

CREATE VIEW audit_archive_work AS SELECT r.* FROM audit_archive_run r JOIN audit_archive_policy_event p ON p.policy_id=r.policy_id AND p.revision=r.policy_revision WHERE p.worker_role=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND r.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned();
CREATE VIEW audit_archive_source AS SELECT m.run_id,e.id,e.actor_type,e.actor_id,e.organization_id,e.country,e.action,e.resource_type,e.resource_id,e.outcome,e.request_id,e.occurred_at,e.changed_fields,e.reason,e.target_organization_id,e.target_country,(2048::bigint+6*coalesce(octet_length(e.reason)::bigint,0)+6*octet_length(e.changed_fields::text)::bigint) AS source_upper_bound
 FROM audit_archive_member m JOIN audit_event e ON e.id=m.event_id JOIN audit_archive_work r ON r.id=m.run_id;
CREATE FUNCTION claim_audit_archive(policy uuid,new_run uuid,at_time timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE selected uuid;policy_revision bigint;cutoff_at timestamptz;members uuid[];
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('audit/archive/claim/v1',0)) THEN RETURN NULL;END IF;
 SELECT r.id INTO selected FROM public.audit_archive_run r JOIN public.audit_archive_policy_event p ON p.policy_id=r.policy_id AND p.revision=r.policy_revision WHERE r.state<>'VERIFIED' AND r.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND p.worker_role=public.archive_caller_role() ORDER BY r.created_at,r.id LIMIT 1;IF FOUND THEN RETURN selected;END IF;
 SELECT p.revision INTO policy_revision FROM public.audit_archive_policy p WHERE p.id=policy AND p.enabled AND p.worker_role=public.archive_caller_role() FOR SHARE;IF NOT FOUND THEN RETURN NULL;END IF;
 cutoff_at:=date_trunc('day',at_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 SELECT array_agg(t.event_id ORDER BY t.event_id) INTO members FROM(SELECT s.event_id FROM public.audit_archive_spool s JOIN public.audit_event e ON e.id=s.event_id WHERE s.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND e.occurred_at<cutoff_at AND NOT EXISTS(SELECT 1 FROM public.audit_archive_member m WHERE m.event_id=s.event_id) ORDER BY s.event_id LIMIT 250 FOR UPDATE OF s SKIP LOCKED)t;
 IF members IS NULL AND EXISTS(SELECT 1 FROM public.audit_archive_run r WHERE r.policy_id=policy AND r.archive_date=(at_time AT TIME ZONE 'UTC')::date) THEN RETURN NULL;END IF;
 INSERT INTO public.audit_archive_run(id,policy_id,policy_revision,archive_date,cutoff,created_at,updated_at,record_count) VALUES(new_run,policy,policy_revision,(at_time AT TIME ZONE 'UTC')::date,cutoff_at,at_time,at_time,coalesce(cardinality(members),0));
 INSERT INTO public.audit_archive_member(event_id,run_id) SELECT event_id,new_run FROM unnest(members) event_id;RETURN new_run;
END $$;
REVOKE ALL ON FUNCTION claim_audit_archive(uuid,uuid,timestamptz) FROM PUBLIC;
CREATE FUNCTION acknowledge_audit_archive(selected_run uuid,kind text,digest text,bytes integer,key_version text,at_time timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE run public.audit_archive_run%ROWTYPE;
BEGIN
 SELECT r.* INTO run FROM public.audit_archive_run r JOIN public.audit_archive_policy_event p ON p.policy_id=r.policy_id AND p.revision=r.policy_revision WHERE r.id=selected_run AND r.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND p.worker_role=public.archive_caller_role() FOR UPDATE OF r;IF NOT FOUND THEN RETURN false;END IF;
 IF kind='PART' THEN
  IF run.state<>'PENDING' THEN RETURN(run.part_sha256,run.part_bytes,run.part_key_version) IS NOT DISTINCT FROM(digest,bytes,key_version);END IF;
  UPDATE public.audit_archive_run SET state='PART_VERIFIED',revision=2,updated_at=at_time,part_sha256=digest,part_bytes=bytes,part_key_version=key_version WHERE id=selected_run;RETURN true;
 ELSIF kind='MANIFEST' THEN
  IF run.state='VERIFIED' THEN RETURN(run.manifest_sha256,run.manifest_bytes,run.manifest_key_version) IS NOT DISTINCT FROM(digest,bytes,key_version);END IF;
  IF run.state<>'PART_VERIFIED' THEN RETURN false;END IF;
  UPDATE public.audit_archive_run SET state='VERIFIED',revision=3,updated_at=at_time,manifest_sha256=digest,manifest_bytes=bytes,manifest_key_version=key_version WHERE id=selected_run;RETURN true;
 END IF;RETURN false;
END $$;
REVOKE ALL ON FUNCTION acknowledge_audit_archive(uuid,text,text,integer,text,timestamptz) FROM PUBLIC;

CREATE FUNCTION protect_archive_policy_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.audit_archive_policy_event'::regclass OR pg_trigger_depth()<2 OR NEW.database_login<>session_user OR NEW.effective_role<>(CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END)
 OR NOT EXISTS(SELECT 1 FROM public.audit_archive_policy p WHERE(p.id,p.revision,p.worker_role,p.enabled,p.configuration_reference,p.updated_at)=(NEW.policy_id,NEW.revision,NEW.worker_role,NEW.enabled,NEW.configuration_reference,NEW.occurred_at)) THEN RAISE EXCEPTION 'Derived archive policy event required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_archive_policy_event() FROM PUBLIC;
CREATE TRIGGER tr_archive_policy_event_source BEFORE INSERT ON audit_archive_policy_event FOR EACH ROW EXECUTE FUNCTION protect_archive_policy_event();
CREATE FUNCTION protect_archive_spool() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.audit_archive_spool'::regclass OR pg_trigger_depth()<2 OR NEW.created_xid<>pg_current_xact_id() OR NOT EXISTS(SELECT 1 FROM public.audit_event WHERE id=NEW.event_id) THEN RAISE EXCEPTION 'Atomic original audit spool source required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_archive_spool() FROM PUBLIC;
CREATE TRIGGER tr_archive_spool_source BEFORE INSERT ON audit_archive_spool FOR EACH ROW EXECUTE FUNCTION protect_archive_spool();
CREATE FUNCTION protect_archive_run_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.audit_archive_run_event'::regclass OR pg_trigger_depth()<2 OR NEW.database_login<>session_user OR NEW.effective_role<>(CASE WHEN current_setting('role')='none' THEN session_user::text ELSE current_setting('role') END)
 OR NOT EXISTS(SELECT 1 FROM public.audit_archive_run r WHERE(r.id,r.revision,r.state,r.updated_at)=(NEW.run_id,NEW.revision,NEW.state,NEW.occurred_at)) THEN RAISE EXCEPTION 'Derived archive run event required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_archive_run_event() FROM PUBLIC;
CREATE TRIGGER tr_archive_run_event_source BEFORE INSERT ON audit_archive_run_event FOR EACH ROW EXECUTE FUNCTION protect_archive_run_event();

CREATE FUNCTION protect_archive_member() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.audit_archive_member'::regclass OR NOT EXISTS(
 SELECT 1 FROM public.audit_archive_run r JOIN public.audit_archive_policy_event p ON p.policy_id=r.policy_id AND p.revision=r.policy_revision
 JOIN public.audit_archive_spool s ON s.event_id=NEW.event_id JOIN public.audit_event e ON e.id=s.event_id
 WHERE r.id=NEW.run_id AND r.created_xid=pg_current_xact_id() AND r.state='PENDING' AND p.worker_role=public.archive_caller_role()
 AND s.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND e.occurred_at<r.cutoff) THEN RAISE EXCEPTION 'Committed original archive membership required';END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_archive_member() FROM PUBLIC;
CREATE TRIGGER tr_archive_member_source BEFORE INSERT ON audit_archive_member FOR EACH ROW EXECUTE FUNCTION protect_archive_member();
REVOKE ALL ON FUNCTION protect_archive_policy() FROM PUBLIC;

CREATE FUNCTION archive_policy_matches(selected_policy uuid,configuration text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.audit_archive_policy p WHERE p.id=selected_policy AND p.worker_role=public.archive_caller_role() AND p.configuration_reference=configuration)
$$;
REVOKE ALL ON FUNCTION archive_policy_matches(uuid,text) FROM PUBLIC;

UPDATE backend_schema_version SET version=73 WHERE id=1;
