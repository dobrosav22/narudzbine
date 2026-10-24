-- Retire capabilities without deleting original challenge/exchange/recovery source identity.
ALTER TABLE external_challenge ALTER COLUMN state_hash DROP NOT NULL;
DO $$ DECLARE target text;BEGIN
 SELECT conname INTO STRICT target FROM pg_constraint WHERE conrelid='external_challenge'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%original_token_hash%' AND pg_get_constraintdef(oid) LIKE '%purpose%';
 EXECUTE format('ALTER TABLE external_challenge DROP CONSTRAINT %I',target);
 SELECT conname INTO STRICT target FROM pg_constraint WHERE conrelid='external_challenge'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%native_challenge%' AND pg_get_constraintdef(oid) LIKE '%transport%';
 EXECUTE format('ALTER TABLE external_challenge DROP CONSTRAINT %I',target);
END $$;
ALTER TABLE external_challenge ADD CONSTRAINT ck_external_retired_bindings CHECK(state_hash IS NOT NULL OR(encrypted_verifier IS NULL AND browser_binding_hash IS NULL AND original_token_hash IS NULL AND native_challenge IS NULL));
ALTER TABLE external_challenge ADD CONSTRAINT ck_external_purpose_bindings CHECK(
 (purpose='LOGIN' AND account_id IS NULL AND original_session_id IS NULL AND original_token_hash IS NULL AND security_epoch IS NULL AND credential_generation IS NULL)
 OR(purpose<>'LOGIN' AND account_id IS NOT NULL AND original_session_id IS NOT NULL AND(original_token_hash IS NOT NULL OR state_hash IS NULL) AND security_epoch IS NOT NULL AND credential_generation IS NOT NULL));
ALTER TABLE external_challenge ADD CONSTRAINT ck_external_transport_bindings CHECK(
 (transport='BROWSER' AND return_target='WEB' AND native_challenge IS NULL AND(browser_binding_hash IS NOT NULL OR state_hash IS NULL))
 OR(transport='NATIVE' AND return_target IN('ANDROID','IOS') AND browser_binding_hash IS NULL AND(native_challenge IS NOT NULL OR state_hash IS NULL)));
CREATE TRIGGER tr_external_state_initial_secret BEFORE INSERT ON external_challenge FOR EACH ROW EXECUTE FUNCTION require_initial_proof_secret('state_hash');
ALTER TABLE external_exchange DROP CONSTRAINT external_exchange_pkey;
ALTER TABLE external_exchange DROP CONSTRAINT external_exchange_challenge_id_key;
ALTER TABLE external_exchange ADD PRIMARY KEY(challenge_id);
ALTER TABLE external_exchange ALTER COLUMN code_hash DROP NOT NULL;
ALTER TABLE external_exchange ADD CONSTRAINT uk_external_exchange_active_code UNIQUE(code_hash);
CREATE TRIGGER tr_external_exchange_initial_secret BEFORE INSERT ON external_exchange FOR EACH ROW EXECUTE FUNCTION require_initial_proof_secret('code_hash');
CREATE FUNCTION require_exchange_live_bindings() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.external_challenge f WHERE f.id=NEW.challenge_id AND f.state_hash IS NOT NULL AND f.encrypted_verifier IS NOT NULL AND f.native_challenge IS NOT NULL FOR UPDATE) THEN RAISE EXCEPTION 'Live native exchange bindings required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER tr_external_exchange_live_bindings BEFORE INSERT ON external_exchange FOR EACH ROW EXECUTE FUNCTION require_exchange_live_bindings();
ALTER TABLE recovery_case ADD COLUMN acceptance_retired boolean NOT NULL DEFAULT false;
DO $$ DECLARE target text;BEGIN
 SELECT conname INTO STRICT target FROM pg_constraint WHERE conrelid='recovery_case'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%NOTICE_PERIOD%' AND pg_get_constraintdef(oid) LIKE '%token_hash%';
 EXECUTE format('ALTER TABLE recovery_case DROP CONSTRAINT %I',target);
END $$;
ALTER TABLE recovery_case ADD CONSTRAINT ck_recovery_notice_proof CHECK(state<>'NOTICE_PERIOD' OR(reviewer_id IS NOT NULL AND(token_hash IS NOT NULL OR acceptance_retired)));
ALTER TABLE recovery_case ADD CONSTRAINT ck_recovery_retired_proof CHECK(NOT acceptance_retired OR token_hash IS NULL);
CREATE FUNCTION require_initial_recovery_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.acceptance_retired THEN RAISE EXCEPTION 'Initial recovery acceptance cannot be retired';END IF;RETURN NEW;
END $$;
CREATE TRIGGER tr_recovery_initial_acceptance BEFORE INSERT ON recovery_case FOR EACH ROW EXECUTE FUNCTION require_initial_recovery_acceptance();
CREATE OR REPLACE FUNCTION protect_external_challenge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.state_hash IS NOT NULL AND NEW.state_hash IS NULL AND OLD.state IN('OPEN','COMPLETED')
  AND NEW.encrypted_verifier IS NULL AND NEW.browser_binding_hash IS NULL AND NEW.original_token_hash IS NULL AND NEW.native_challenge IS NULL
  AND (to_jsonb(NEW)-ARRAY['state_hash','browser_binding_hash','original_token_hash','native_challenge'])=(to_jsonb(OLD)-ARRAY['state_hash','browser_binding_hash','original_token_hash','native_challenge']) THEN RETURN NEW;END IF;
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
CREATE OR REPLACE FUNCTION protect_external_exchange() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.code_hash IS NOT NULL AND NEW.code_hash IS NULL AND(to_jsonb(NEW)-'code_hash')=(to_jsonb(OLD)-'code_hash') THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND OLD.code_hash IS NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN RAISE EXCEPTION 'Retired exchange cannot be consumed';END IF;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External exchange history must be retained' USING ERRCODE='23514'; END IF;
    IF (to_jsonb(NEW)-'consumed_at') IS DISTINCT FROM (to_jsonb(OLD)-'consumed_at')
        OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL THEN
        RAISE EXCEPTION 'External exchange is immutable and single use' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION protect_recovery_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NOT OLD.acceptance_retired AND NEW.acceptance_retired AND OLD.token_hash IS NOT NULL AND NEW.token_hash IS NULL AND OLD.state IN('NOTICE_PERIOD','COMPLETED','REJECTED')
  AND(to_jsonb(NEW)-ARRAY['token_hash','acceptance_retired'])=(to_jsonb(OLD)-ARRAY['token_hash','acceptance_retired']) THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND (NEW.acceptance_retired IS DISTINCT FROM OLD.acceptance_retired OR(OLD.acceptance_retired AND(NEW.state,NEW.consumed_at,NEW.email_change_id) IS DISTINCT FROM(OLD.state,OLD.consumed_at,OLD.email_change_id))) THEN RAISE EXCEPTION 'Retired recovery acceptance is immutable';END IF;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Recovery history must be retained' USING ERRCODE='23514'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.creator_id IS DISTINCT FROM OLD.creator_id OR NEW.creator_epoch IS DISTINCT FROM OLD.creator_epoch
        OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.target_id IS DISTINCT FROM OLD.target_id
        OR NEW.former_owner_id IS DISTINCT FROM OLD.former_owner_id OR NEW.target_epoch IS DISTINCT FROM OLD.target_epoch
        OR NEW.target_generation IS DISTINCT FROM OLD.target_generation OR NEW.owner_epoch IS DISTINCT FROM OLD.owner_epoch
        OR NEW.owner_generation IS DISTINCT FROM OLD.owner_generation OR NEW.kind IS DISTINCT FROM OLD.kind
        OR NEW.old_email IS DISTINCT FROM OLD.old_email OR NEW.new_email IS DISTINCT FROM OLD.new_email
        OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.evidence_reference IS DISTINCT FROM OLD.evidence_reference
        OR NEW.request_digest IS DISTINCT FROM OLD.request_digest OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at
        OR (OLD.reviewer_id IS NOT NULL AND (NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id OR NEW.reviewer_epoch IS DISTINCT FROM OLD.reviewer_epoch
            OR NEW.review_reason IS DISTINCT FROM OLD.review_reason OR NEW.review_reference IS DISTINCT FROM OLD.review_reference
            OR NEW.not_before IS DISTINCT FROM OLD.not_before OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.token_hash IS DISTINCT FROM OLD.token_hash))
        OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)
        OR (OLD.email_change_id IS NOT NULL AND NEW.email_change_id IS DISTINCT FROM OLD.email_change_id)
        OR NOT ((OLD.state='EVIDENCE_REVIEW' AND NEW.state IN ('NOTICE_PERIOD','REJECTED'))
            OR (OLD.state='NOTICE_PERIOD' AND NEW.state IN ('NOTICE_PERIOD','RECONCILING','COMPLETED'))
            OR (OLD.state='RECONCILING' AND NEW.state IN ('COMPLETED','REJECTED'))) THEN
        RAISE EXCEPTION 'Recovery identity or transition invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE INDEX ix_external_flow_binding_retention ON external_challenge(expires_at,id) WHERE state_hash IS NOT NULL;
CREATE INDEX ix_external_exchange_code_retention ON external_exchange(expires_at,challenge_id) WHERE code_hash IS NOT NULL;
CREATE INDEX ix_recovery_acceptance_retention ON recovery_case(expires_at,id) WHERE token_hash IS NOT NULL AND NOT acceptance_retired;
UPDATE backend_schema_version SET version=66 WHERE id=1;
