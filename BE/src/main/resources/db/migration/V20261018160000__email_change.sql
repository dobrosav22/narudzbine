ALTER TABLE credential_operation DROP CONSTRAINT credential_operation_kind_check;
ALTER TABLE credential_operation ADD CHECK(kind IN ('RESET','CHANGE','EMAIL'));
ALTER TABLE credential_operation DROP CONSTRAINT credential_operation_check;
ALTER TABLE credential_operation ADD CHECK((kind='RESET' AND current_session_id IS NULL) OR (kind IN ('CHANGE','EMAIL') AND current_session_id IS NOT NULL));
CREATE TABLE email_change (
    id uuid PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES account_identity(id),
    request_revision_token varchar(256) NOT NULL,
    old_email varchar(254) COLLATE "C" NOT NULL,
    new_email varchar(254) COLLATE "C" NOT NULL CHECK(new_email<>old_email),
    security_epoch bigint NOT NULL,
    credential_generation bigint NOT NULL,
    state varchar(16) NOT NULL CHECK(state IN ('PENDING','RECONCILING','COMPLETED','CANCELLED','EXPIRED')),
    revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
    old_verified boolean NOT NULL DEFAULT false,
    new_verified boolean NOT NULL DEFAULT false,
    operation_id uuid UNIQUE REFERENCES credential_operation(id),
    created_at timestamptz(3) NOT NULL,
    expires_at timestamptz(3) NOT NULL CHECK(expires_at=created_at+interval '24 hours'),
    updated_at timestamptz(3) NOT NULL,
    FOREIGN KEY(operation_id,account_id) REFERENCES credential_operation(id,account_id),
    UNIQUE(account_id,request_revision_token), UNIQUE(id,account_id),
    CHECK(state NOT IN ('RECONCILING','COMPLETED') OR operation_id IS NOT NULL)
);
CREATE UNIQUE INDEX uk_pending_email_change ON email_change(account_id) WHERE state IN ('PENDING','RECONCILING');
CREATE TABLE email_change_proof (
    id uuid PRIMARY KEY,
    change_id uuid NOT NULL REFERENCES email_change(id),
    side varchar(3) NOT NULL CHECK(side IN ('OLD','NEW')),
    token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
    verified_at timestamptz(3),
    UNIQUE(change_id,side)
);
CREATE TABLE email_change_delivery (
    proof_id uuid PRIMARY KEY REFERENCES email_change_proof(id),
    encrypted_token bytea NOT NULL CHECK(octet_length(encrypted_token)=71),
    locale varchar(64) NOT NULL,
    state varchar(12) NOT NULL CHECK(state='QUEUED'),
    created_at timestamptz(3) NOT NULL
);
CREATE TABLE login_email_claim (
    email varchar(254) COLLATE "C" PRIMARY KEY,
    account_id uuid NOT NULL REFERENCES account_identity(id) DEFERRABLE INITIALLY DEFERRED,
    kind varchar(12) NOT NULL CHECK(kind IN ('CURRENT','RESERVED','IN_FLIGHT')),
    change_id uuid REFERENCES email_change(id),
    expires_at timestamptz(3),
    CHECK ((kind='CURRENT' AND change_id IS NULL AND expires_at IS NULL)
        OR (kind='RESERVED' AND change_id IS NOT NULL AND expires_at IS NOT NULL)
        OR (kind='IN_FLIGHT' AND change_id IS NOT NULL AND expires_at IS NULL)),
    FOREIGN KEY(change_id,account_id) REFERENCES email_change(id,account_id)
);
INSERT INTO login_email_claim(email,account_id,kind) SELECT email,id,'CURRENT' FROM account_identity;
CREATE FUNCTION lock_login_email(value text) RETURNS void LANGUAGE sql AS $$
    SELECT pg_advisory_xact_lock(hashtextextended(value,15001));
$$;
CREATE FUNCTION protect_login_email_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        IF OLD.kind='CURRENT' AND EXISTS(SELECT 1 FROM account_identity WHERE id=OLD.account_id AND email<>OLD.email) THEN RETURN OLD; END IF;
        IF OLD.kind='RESERVED' AND EXISTS (
            SELECT 1 FROM email_change e JOIN account_identity a ON a.id=e.account_id WHERE e.id=OLD.change_id
            AND (e.state IN ('CANCELLED','EXPIRED') OR (e.state='PENDING' AND (
                a.security_epoch<>e.security_epoch OR a.credential_generation<>e.credential_generation)))) THEN RETURN OLD; END IF;
        IF OLD.kind='IN_FLIGHT' AND EXISTS(SELECT 1 FROM email_change e JOIN credential_operation p ON p.id=e.operation_id
            WHERE e.id=OLD.change_id AND e.state='CANCELLED' AND p.state='REJECTED') THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Live email claim cannot be released' USING ERRCODE='23514';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NOT (
        (OLD.kind='RESERVED' AND NEW.kind='IN_FLIGHT' AND NEW.change_id=OLD.change_id AND NEW.expires_at IS NULL)
        OR (OLD.kind='IN_FLIGHT' AND NEW.kind='CURRENT' AND NEW.change_id IS NULL AND NEW.expires_at IS NULL
            AND EXISTS(SELECT 1 FROM account_identity WHERE id=NEW.account_id AND email=NEW.email))) THEN
        RAISE EXCEPTION 'Email claim transition is invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_login_email_claim BEFORE UPDATE OR DELETE ON login_email_claim FOR EACH ROW EXECUTE FUNCTION protect_login_email_claim();
CREATE FUNCTION coordinate_account_email() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE claim login_email_claim%ROWTYPE; value text;
BEGIN
    IF TG_OP='INSERT' THEN
        PERFORM lock_login_email(NEW.email);
        -- A setup cannot take a live reservation; expiry cleanup happens through the controlled claim workflow.
        INSERT INTO login_email_claim(email,account_id,kind) VALUES (NEW.email,NEW.id,'CURRENT');
        RETURN NEW;
    END IF;
    IF NEW.email=OLD.email THEN RETURN NEW; END IF;
    FOR value IN SELECT unnest(ARRAY[OLD.email,NEW.email]) ORDER BY 1 LOOP PERFORM lock_login_email(value); END LOOP;
    SELECT * INTO claim FROM login_email_claim WHERE email=NEW.email FOR UPDATE;
    IF claim.account_id IS DISTINCT FROM NEW.id OR claim.kind IS DISTINCT FROM 'IN_FLIGHT' OR NOT EXISTS (
        SELECT 1 FROM email_change e JOIN credential_operation p ON p.id=e.operation_id
        WHERE e.id=claim.change_id AND e.state='RECONCILING' AND p.state='APPLIED' AND p.kind='EMAIL'
            AND e.account_id=NEW.id AND e.old_email=OLD.email AND e.new_email=NEW.email
            AND OLD.credential_operation_pending AND p.security_epoch=OLD.security_epoch
            AND NEW.credential_generation=OLD.credential_generation+1) THEN
        RAISE EXCEPTION 'Email update requires an applied authorized operation' USING ERRCODE='23514';
    END IF;
    UPDATE login_email_claim SET kind='CURRENT',change_id=NULL,expires_at=NULL WHERE email=NEW.email;
    DELETE FROM login_email_claim WHERE email=OLD.email AND account_id=NEW.id AND kind='CURRENT';
    RETURN NEW;
END;
$$;
-- Acquire the address guard before INSERT takes the account email unique-index lock.
-- Otherwise concurrent setup and completion could acquire those two locks in reverse order.
CREATE TRIGGER tr_account_email_claim_insert BEFORE INSERT ON account_identity FOR EACH ROW EXECUTE FUNCTION coordinate_account_email();
CREATE TRIGGER tr_account_email_claim AFTER UPDATE OF email ON account_identity FOR EACH ROW EXECUTE FUNCTION coordinate_account_email();
CREATE FUNCTION protect_email_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Email change history must be retained' USING ERRCODE='23514'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id
        OR NEW.request_revision_token IS DISTINCT FROM OLD.request_revision_token OR NEW.old_email IS DISTINCT FROM OLD.old_email
        OR NEW.new_email IS DISTINCT FROM OLD.new_email OR NEW.security_epoch IS DISTINCT FROM OLD.security_epoch
        OR NEW.credential_generation IS DISTINCT FROM OLD.credential_generation OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.revision<>OLD.revision+1
        OR (OLD.old_verified AND NOT NEW.old_verified) OR (OLD.new_verified AND NOT NEW.new_verified)
        OR NOT ((OLD.state='PENDING' AND NEW.state IN ('PENDING','RECONCILING','CANCELLED','EXPIRED'))
            OR (OLD.state='RECONCILING' AND NEW.state IN ('COMPLETED','CANCELLED')))
        OR (OLD.operation_id IS NOT NULL AND NEW.operation_id IS DISTINCT FROM OLD.operation_id) THEN
        RAISE EXCEPTION 'Email change identity or transition is invalid' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_email_change BEFORE UPDATE OR DELETE ON email_change FOR EACH ROW EXECUTE FUNCTION protect_email_change();
CREATE FUNCTION protect_email_change_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Email proof history must be retained' USING ERRCODE='23514'; END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.change_id IS DISTINCT FROM OLD.change_id OR NEW.side IS DISTINCT FROM OLD.side
        OR NEW.token_hash IS DISTINCT FROM OLD.token_hash OR OLD.verified_at IS NOT NULL OR NEW.verified_at IS NULL THEN
        RAISE EXCEPTION 'Email proof is immutable and single-use' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER tr_email_change_proof BEFORE UPDATE OR DELETE ON email_change_proof FOR EACH ROW EXECUTE FUNCTION protect_email_change_proof();
ALTER TABLE security_notice ADD COLUMN email_change_id uuid;
ALTER TABLE security_notice ADD FOREIGN KEY(email_change_id,recipient_account_id) REFERENCES email_change(id,account_id);
ALTER TABLE security_notice DROP CONSTRAINT security_notice_event_key_check;
ALTER TABLE security_notice ADD CHECK(event_key IN ('OWNER_CHANGED','PASSWORD_CHANGED','EMAIL_CHANGE_STARTED','EMAIL_CHANGED'));
ALTER TABLE security_notice DROP CONSTRAINT security_notice_check;
ALTER TABLE security_notice ADD CHECK (
    (event_key='OWNER_CHANGED' AND ownership_transfer_id IS NOT NULL AND resource_id=ownership_transfer_id AND organization_id IS NOT NULL
        AND credential_operation_id IS NULL AND email_change_id IS NULL)
    OR (event_key='PASSWORD_CHANGED' AND credential_operation_id IS NOT NULL AND resource_id=credential_operation_id
        AND ownership_transfer_id IS NULL AND email_change_id IS NULL)
    OR (event_key IN ('EMAIL_CHANGE_STARTED','EMAIL_CHANGED') AND email_change_id IS NOT NULL AND resource_id=email_change_id
        AND ownership_transfer_id IS NULL AND (event_key='EMAIL_CHANGE_STARTED')=(credential_operation_id IS NULL))
);
ALTER TABLE outbox_event DROP CONSTRAINT outbox_event_notice_id_key;
ALTER TABLE outbox_event ADD COLUMN destination_key varchar(8) NOT NULL DEFAULT 'CURRENT' CHECK(destination_key IN ('CURRENT','OLD','NEW'));
ALTER TABLE outbox_event ADD COLUMN destination_email varchar(254);
ALTER TABLE outbox_event ADD CHECK((destination_key='CURRENT')=(destination_email IS NULL));
ALTER TABLE outbox_event ADD UNIQUE(notice_id,destination_key);
ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK (
    (resource_type = 'SESSION' AND action IN ('SESSION_CREATED', 'SESSION_REAUTHENTICATED',
        'SESSION_LOGGED_OUT', 'SESSION_REVOKED', 'SESSION_REVOKED_ALL', 'SESSION_EVICTED','SESSION_PASSWORD_ROTATED'))
    OR (resource_type = 'ACCOUNT' AND action IN ('ACCOUNT_LANGUAGE_CHANGED','ACCOUNT_PROFILE_UPDATED') AND resource_id = actor_id)
    OR (resource_type = 'ORGANIZATION' AND action = 'ORGANIZATION_UPDATED' AND actor_type = 'BUSINESS'
        AND organization_id IS NOT NULL AND resource_id = organization_id)
    OR (resource_type = 'LOCATION' AND action IN ('LOCATION_CREATED','LOCATION_UPDATED','LOCATION_ARCHIVED','LOCATION_RESTORED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type = 'CONTACT' AND action IN ('CONTACT_CREATED','CONTACT_UPDATED','CONTACT_ARCHIVED','CONTACT_RESTORED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type = 'MEMBER' AND action IN ('MEMBER_ROLE_CHANGED','MEMBER_DEACTIVATED','MEMBER_REACTIVATED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type='OWNERSHIP_TRANSFER' AND action IN ('TRANSFER_REQUESTED','TRANSFER_REVOKED','TRANSFER_INVALIDATED','TRANSFER_EXPIRED','TRANSFER_ACCEPTED')
        AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type='CREDENTIAL_OPERATION' AND action IN ('PASSWORD_OPERATION_STARTED','PASSWORD_OPERATION_APPLIED',
        'PASSWORD_OPERATION_UNCERTAIN','PASSWORD_OPERATION_REJECTED','PASSWORD_OPERATION_COMPLETED',
        'EMAIL_OPERATION_STARTED','EMAIL_OPERATION_APPLIED','EMAIL_OPERATION_UNCERTAIN','EMAIL_OPERATION_REJECTED','EMAIL_OPERATION_COMPLETED'))
    OR (resource_type='EMAIL_CHANGE' AND action IN ('EMAIL_CHANGE_REQUESTED','EMAIL_ADDRESS_VERIFIED','EMAIL_CHANGE_CANCELLED'))
);
UPDATE backend_schema_version SET version=15 WHERE id=1;
