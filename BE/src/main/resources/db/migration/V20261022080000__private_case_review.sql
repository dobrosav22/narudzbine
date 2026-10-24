-- Explicit operator qualification and committed authorization before private disclosure.
CREATE TABLE privacy_operator(
 account_id uuid PRIMARY KEY REFERENCES platform_account(id),enabled boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz(3) NOT NULL
);
CREATE TABLE privacy_operator_configuration_event(
 account_id uuid NOT NULL REFERENCES privacy_operator(account_id),revision bigint NOT NULL,enabled boolean NOT NULL,
 source_created_at timestamptz(3) NOT NULL,observed_at timestamptz(3) NOT NULL,
 database_login name NOT NULL,database_role_oid oid NOT NULL,change_reference text NOT NULL CHECK(char_length(change_reference) BETWEEN 1 AND 100),
 PRIMARY KEY(account_id,revision)
);
CREATE TRIGGER tr_privacy_operator_config_immutable BEFORE UPDATE OR DELETE ON privacy_operator_configuration_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_privacy_operator_config_no_truncate BEFORE TRUNCATE ON privacy_operator_configuration_event FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION protect_privacy_operator() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Operator qualification retained';END IF;
 IF COALESCE(length(btrim(current_setting('narudzbine.operator_change_reference',true))),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Reviewed qualification change reference required';END IF;
 IF TG_OP='INSERT' THEN IF NEW.revision<>1 THEN RAISE EXCEPTION 'Invalid initial qualification';END IF;
 ELSE IF(to_jsonb(NEW)-ARRAY['enabled','revision']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['enabled','revision']) OR NEW.enabled=OLD.enabled OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Invalid qualification change';END IF;END IF;
 IF NEW.enabled AND NOT EXISTS(SELECT 1 FROM account_identity a WHERE a.id=NEW.account_id AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending) THEN RAISE EXCEPTION 'Active named operator required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_privacy_operator BEFORE INSERT OR UPDATE OR DELETE ON privacy_operator FOR EACH ROW EXECUTE FUNCTION protect_privacy_operator();
CREATE TRIGGER tr_privacy_operator_no_truncate BEFORE TRUNCATE ON privacy_operator FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION record_privacy_operator_configuration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_operator'::regclass OR TG_LEVEL<>'ROW' OR TG_WHEN<>'AFTER' OR TG_OP NOT IN('INSERT','UPDATE') THEN RAISE EXCEPTION 'Qualification source required';END IF;
 INSERT INTO public.privacy_operator_configuration_event(account_id,revision,enabled,source_created_at,observed_at,database_login,database_role_oid,change_reference)
 SELECT NEW.account_id,NEW.revision,NEW.enabled,NEW.created_at,date_trunc('milliseconds',clock_timestamp()),session_user,r.oid,btrim(current_setting('narudzbine.operator_change_reference')) FROM pg_roles r WHERE r.rolname=session_user;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION record_privacy_operator_configuration() FROM PUBLIC;
CREATE TRIGGER tr_privacy_operator_configuration AFTER INSERT OR UPDATE ON privacy_operator FOR EACH ROW EXECUTE FUNCTION record_privacy_operator_configuration();
ALTER TABLE privacy_case ADD CONSTRAINT uq_privacy_case_review_scope UNIQUE(id,organization_id,country);
CREATE TABLE privacy_review_access(
 id uuid PRIMARY KEY REFERENCES audit_event(id),case_id uuid NOT NULL,organization_id uuid NOT NULL,country varchar(2) NOT NULL CHECK(country IN('RS','BA')),
 actor_id uuid NOT NULL REFERENCES privacy_operator(account_id),session_id uuid NOT NULL,transport varchar(7) NOT NULL CHECK(transport IN('BROWSER','NATIVE')),
 qualification_revision bigint NOT NULL CHECK(qualification_revision>0),security_epoch bigint NOT NULL CHECK(security_epoch>=0),credential_generation bigint NOT NULL CHECK(credential_generation>=0),
 session_token_hash bytea CHECK(octet_length(session_token_hash)=32),nonce_hash bytea CHECK(octet_length(nonce_hash)=32),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 1000 AND length(btrim(reason))>0),
 case_reference text NOT NULL CHECK(char_length(case_reference) BETWEEN 1 AND 100 AND length(btrim(case_reference))>0),
 created_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL CHECK(expires_at=created_at+interval '60 seconds'),
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
 CHECK((nonce_hash IS NULL)=(session_token_hash IS NULL)),
 FOREIGN KEY(case_id,organization_id,country) REFERENCES privacy_case(id,organization_id,country),
 FOREIGN KEY(session_id,actor_id) REFERENCES application_session_identity(id,account_id)
);
CREATE INDEX ix_privacy_review_nonce_expiry ON privacy_review_access(expires_at,id) WHERE nonce_hash IS NOT NULL;
CREATE FUNCTION protect_privacy_review_access() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
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
CREATE TRIGGER tr_privacy_review_access BEFORE INSERT OR UPDATE OR DELETE ON privacy_review_access FOR EACH ROW EXECUTE FUNCTION protect_privacy_review_access();
CREATE TRIGGER tr_privacy_review_access_no_truncate BEFORE TRUNCATE ON privacy_review_access FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION read_privacy_review(selected_access uuid,presented_nonce bytea,selected_actor uuid,selected_session uuid,selected_transport text,at_time timestamptz)
 RETURNS TABLE(id uuid,organization_id uuid,country varchar,kind varchar,requester_id uuid,private_reason text,created_at timestamptz)
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT c.id,c.organization_id,c.country,c.kind,c.requester_id,c.private_reason,c.created_at
 FROM public.privacy_review_access p JOIN public.privacy_case c ON(c.id,c.organization_id,c.country)=(p.case_id,p.organization_id,p.country)
 JOIN public.privacy_operator q ON q.account_id=p.actor_id JOIN public.account_identity a ON a.id=p.actor_id
 JOIN public.application_session s ON(s.id,s.account_id)=(p.session_id,p.actor_id)
 WHERE p.id=selected_access AND p.actor_id=selected_actor AND p.session_id=selected_session AND p.transport=selected_transport
 AND octet_length(presented_nonce)=32 AND p.nonce_hash=sha256(presented_nonce) AND p.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned()
 AND p.created_at<=at_time AND at_time<p.expires_at AND q.enabled AND q.revision=p.qualification_revision
 AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending
 AND a.security_epoch=p.security_epoch AND a.credential_generation=p.credential_generation
 AND s.security_epoch=p.security_epoch AND s.credential_generation=p.credential_generation AND s.token_hash=p.session_token_hash AND s.transport=p.transport
 AND s.revoked_at IS NULL AND s.auth_at<=at_time AND at_time<s.auth_at+interval '300 seconds'
 AND at_time<s.absolute_expires_at AND at_time<s.last_qualified_activity_at+interval '30 minutes'
 FOR SHARE OF q,a,s;
$$;
REVOKE ALL ON FUNCTION read_privacy_review(uuid,bytea,uuid,uuid,text,timestamptz) FROM PUBLIC;
CREATE TABLE privacy_review_read(audit_id uuid PRIMARY KEY REFERENCES audit_event(id),access_id uuid NOT NULL REFERENCES privacy_review_access(id));
CREATE FUNCTION protect_privacy_review_read() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_RELID<>'public.privacy_review_read'::regclass OR TG_LEVEL<>'ROW' THEN RAISE EXCEPTION 'Private review source required';END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Private review evidence immutable';END IF;
 IF NOT EXISTS(SELECT 1 FROM privacy_review_access p JOIN audit_event e ON e.id=NEW.audit_id WHERE p.id=NEW.access_id
  AND p.created_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() AND e.actor_type='PLATFORM_ADMIN' AND e.actor_id=p.actor_id
  AND e.action='PRIVACY_CASE_PRIVATE_READ' AND e.resource_type='PRIVACY_CASE' AND e.resource_id=p.case_id
  AND e.target_organization_id=p.organization_id AND e.target_country=p.country AND e.occurred_at>=p.created_at AND e.occurred_at<p.expires_at) THEN RAISE EXCEPTION 'Committed review source required';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION protect_privacy_review_read() FROM PUBLIC;
CREATE TRIGGER tr_privacy_review_read BEFORE INSERT OR UPDATE OR DELETE ON privacy_review_read FOR EACH ROW EXECUTE FUNCTION protect_privacy_review_read();
CREATE TRIGGER tr_privacy_review_read_no_truncate BEFORE TRUNCATE ON privacy_review_read FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
DO $$ DECLARE previous text;BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR(resource_type=''PRIVACY_CASE'' AND actor_type=''PLATFORM_ADMIN'' AND target_organization_id IS NOT NULL AND action IN(''PRIVACY_REVIEW_AUTHORIZED'',''PRIVACY_CASE_PRIVATE_READ'')))',previous);
END $$;
UPDATE backend_schema_version SET version=68 WHERE id=1;
