-- Retain original source/account identity without retaining authentication payload indefinitely.
CREATE TABLE application_session_identity (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES account_identity(id),
    UNIQUE(id,account_id)
);
INSERT INTO application_session_identity(id,account_id) SELECT id,account_id FROM application_session;
CREATE FUNCTION protect_session_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    RAISE EXCEPTION 'Session identity binding retained' USING ERRCODE='23514';
END $$;
CREATE TRIGGER tr_session_binding BEFORE UPDATE OR DELETE ON application_session_identity
    FOR EACH ROW EXECUTE FUNCTION protect_session_binding();

-- Fixed definer scope lets the session writer reserve identities without direct tombstone writes.
CREATE FUNCTION reserve_session_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
    SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
    INSERT INTO public.application_session_identity(id,account_id) VALUES(NEW.id,NEW.account_id);
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION reserve_session_identity() FROM PUBLIC;
CREATE TRIGGER tr_reserve_session_identity BEFORE INSERT ON application_session
    FOR EACH ROW EXECUTE FUNCTION reserve_session_identity();

ALTER TABLE credential_operation DROP CONSTRAINT credential_operation_current_session_id_fkey;
ALTER TABLE credential_operation ADD CONSTRAINT fk_credential_original_session
    FOREIGN KEY(current_session_id,account_id) REFERENCES application_session_identity(id,account_id);
ALTER TABLE external_challenge DROP CONSTRAINT external_challenge_original_session_id_account_id_fkey;
ALTER TABLE external_challenge ADD CONSTRAINT fk_external_original_session
    FOREIGN KEY(original_session_id,account_id) REFERENCES application_session_identity(id,account_id);

CREATE FUNCTION require_live_original_session() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE source_id uuid; BEGIN
    IF TG_TABLE_NAME='credential_operation' THEN source_id=NEW.current_session_id;
    ELSE source_id=NEW.original_session_id; END IF;
    IF source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.application_session s WHERE s.id=source_id AND s.account_id=NEW.account_id) THEN
        RAISE EXCEPTION 'Live original session required' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tr_credential_live_session BEFORE INSERT ON credential_operation
    FOR EACH ROW EXECUTE FUNCTION require_live_original_session();
CREATE TRIGGER tr_external_live_session BEFORE INSERT ON external_challenge
    FOR EACH ROW EXECUTE FUNCTION require_live_original_session();
CREATE INDEX ix_session_retention_absolute ON application_session(absolute_expires_at,id);
CREATE INDEX ix_session_retention_idle ON application_session(last_qualified_activity_at,id);
CREATE INDEX ix_session_retention_revoked ON application_session(revoked_at,id) WHERE revoked_at IS NOT NULL;
CREATE INDEX ix_credential_session_retention ON credential_operation(current_session_id,updated_at) WHERE current_session_id IS NOT NULL;
CREATE INDEX ix_external_session_retention ON external_challenge(original_session_id,expires_at) WHERE original_session_id IS NOT NULL;
UPDATE backend_schema_version SET version=65 WHERE id=1;
