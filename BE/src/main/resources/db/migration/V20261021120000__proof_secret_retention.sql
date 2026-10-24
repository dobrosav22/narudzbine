-- Retain original proof/challenge identity and outcomes; no data clearing during migration.
CREATE FUNCTION require_initial_proof_secret() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF to_jsonb(NEW)->>TG_ARGV[0] IS NULL THEN RAISE EXCEPTION 'Initial proof secret required';END IF;RETURN NEW;
END $$;
ALTER TABLE password_reset_proof ALTER COLUMN token_hash DROP NOT NULL;
CREATE OR REPLACE FUNCTION protect_password_reset_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.token_hash IS NOT NULL AND NEW.token_hash IS NULL AND (to_jsonb(NEW)-'token_hash')=(to_jsonb(OLD)-'token_hash') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND NEW.token_hash IS NULL AND (OLD.state='ACTIVE' AND NEW.state='USED') THEN RAISE EXCEPTION 'Retired proof cannot be consumed';END IF;

    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Reset proof history must be retained' USING ERRCODE='23514'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
        OR NEW.email IS DISTINCT FROM OLD.email OR NEW.security_epoch IS DISTINCT FROM OLD.security_epoch
        OR NEW.credential_generation IS DISTINCT FROM OLD.credential_generation OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR OLD.state<>'ACTIVE' OR NEW.state NOT IN ('USED','INVALIDATED') THEN
        RAISE EXCEPTION 'Reset proof identity and terminal outcome are immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_password_reset_proof_initial_secret BEFORE INSERT ON password_reset_proof FOR EACH ROW EXECUTE FUNCTION require_initial_proof_secret('token_hash');
CREATE INDEX ix_password_reset_proof_proof_retention ON password_reset_proof(expires_at,id) WHERE token_hash IS NOT NULL;
ALTER TABLE email_change_proof ALTER COLUMN token_hash DROP NOT NULL;
CREATE OR REPLACE FUNCTION protect_email_change_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.token_hash IS NOT NULL AND NEW.token_hash IS NULL AND (to_jsonb(NEW)-'token_hash')=(to_jsonb(OLD)-'token_hash') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND NEW.token_hash IS NULL AND (OLD.verified_at IS NULL AND NEW.verified_at IS NOT NULL) THEN RAISE EXCEPTION 'Retired proof cannot be consumed';END IF;

    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Email proof history must be retained' USING ERRCODE='23514'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.change_id IS DISTINCT FROM OLD.change_id OR NEW.side IS DISTINCT FROM OLD.side
        OR NEW.token_hash IS DISTINCT FROM OLD.token_hash OR OLD.verified_at IS NOT NULL OR NEW.verified_at IS NULL THEN
        RAISE EXCEPTION 'Email proof is immutable and single-use' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_email_change_proof_initial_secret BEFORE INSERT ON email_change_proof FOR EACH ROW EXECUTE FUNCTION require_initial_proof_secret('token_hash');
CREATE INDEX ix_email_change_proof_secret_retention ON email_change_proof(change_id,id) WHERE token_hash IS NOT NULL;
CREATE INDEX ix_email_change_retention_expiry ON email_change(expires_at,id);
ALTER TABLE setup_email_proof ALTER COLUMN token_hash DROP NOT NULL;
CREATE OR REPLACE FUNCTION protect_setup_proof() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.token_hash IS NOT NULL AND NEW.token_hash IS NULL AND (to_jsonb(NEW)-'token_hash')=(to_jsonb(OLD)-'token_hash') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND NEW.token_hash IS NULL AND (OLD.state='ACTIVE' AND NEW.state='USED') THEN RAISE EXCEPTION 'Retired proof cannot be consumed';END IF;

 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Setup proof history retained' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') OR NOT ((OLD.state='ACTIVE' AND NEW.state IN ('USED','INVALIDATED')) OR (OLD.state='USED' AND NEW.state='INVALIDATED')) THEN RAISE EXCEPTION 'Setup proof transition invalid' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_setup_email_proof_initial_secret BEFORE INSERT ON setup_email_proof FOR EACH ROW EXECUTE FUNCTION require_initial_proof_secret('token_hash');
CREATE INDEX ix_setup_email_proof_proof_retention ON setup_email_proof(expires_at,id) WHERE token_hash IS NOT NULL;
ALTER TABLE device_verification ALTER COLUMN code_hash DROP NOT NULL;
CREATE OR REPLACE FUNCTION protect_device_verification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.code_hash IS NOT NULL AND NEW.code_hash IS NULL AND (to_jsonb(NEW)-'code_hash')=(to_jsonb(OLD)-'code_hash') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND NEW.code_hash IS NULL AND (OLD.state<>'CONSUMED' AND NEW.state='CONSUMED') THEN RAISE EXCEPTION 'Retired proof cannot be consumed';END IF;

 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'state'-'device_id'-'device_revision') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'device_id'-'device_revision')
 OR OLD.state IN('REJECTED','CONSUMED') OR NEW.state NOT IN('ACCEPTED','UNKNOWN','REJECTED','CONSUMED') THEN RAISE EXCEPTION 'Invalid device verification transition';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_device_verification_initial_secret BEFORE INSERT ON device_verification FOR EACH ROW EXECUTE FUNCTION require_initial_proof_secret('code_hash');
CREATE INDEX ix_device_verification_proof_retention ON device_verification(expires_at,id) WHERE code_hash IS NOT NULL;
ALTER TABLE external_challenge ALTER COLUMN encrypted_verifier DROP NOT NULL;
CREATE OR REPLACE FUNCTION protect_external_challenge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.encrypted_verifier IS NOT NULL AND NEW.encrypted_verifier IS NULL AND (to_jsonb(NEW)-'encrypted_verifier')=(to_jsonb(OLD)-'encrypted_verifier') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND NEW.encrypted_verifier IS NULL AND (OLD.state='OPEN' AND NEW.state='CLAIMED') THEN RAISE EXCEPTION 'Retired proof cannot be consumed';END IF;

    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External challenge history must be retained' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state')
        OR NOT ((OLD.state='OPEN' AND NEW.state='CLAIMED') OR (OLD.state='CLAIMED' AND NEW.state='COMPLETED')) THEN
        RAISE EXCEPTION 'External challenge transition invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_external_challenge_initial_secret BEFORE INSERT ON external_challenge FOR EACH ROW EXECUTE FUNCTION require_initial_proof_secret('encrypted_verifier');
CREATE INDEX ix_external_challenge_proof_retention ON external_challenge(expires_at,id) WHERE encrypted_verifier IS NOT NULL;
UPDATE backend_schema_version SET version=64 WHERE id=1;
