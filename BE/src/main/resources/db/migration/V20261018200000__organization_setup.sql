CREATE TABLE plan_revision (
 id uuid PRIMARY KEY, code varchar(7) NOT NULL CHECK(code IN ('STARTER','GROWTH','PRO')), revision integer NOT NULL CHECK(revision>0),
 retired boolean NOT NULL DEFAULT false, product_limit integer NOT NULL CHECK(product_limit>0), active_buyer_limit integer NOT NULL CHECK(active_buyer_limit>0), UNIQUE(code,revision)
);
CREATE FUNCTION protect_plan_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'retired') IS DISTINCT FROM (to_jsonb(OLD)-'retired') OR OLD.retired OR NOT NEW.retired THEN RAISE EXCEPTION 'Plan definitions are immutable' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_plan_revision BEFORE UPDATE OR DELETE ON plan_revision FOR EACH ROW EXECUTE FUNCTION protect_plan_revision();
INSERT INTO plan_revision(id,code,revision,product_limit,active_buyer_limit) VALUES ('01a15013-b677-7d60-ae6f-3b7c6717a37f','STARTER',1,10,5);
INSERT INTO plan_revision(id,code,revision,product_limit,active_buyer_limit) VALUES ('01a15013-b677-7aca-b445-961c6776aa93','GROWTH',1,250,50);
INSERT INTO plan_revision(id,code,revision,product_limit,active_buyer_limit) VALUES ('01a15013-b677-7e8e-9ae6-b0da35fde999','PRO',1,5000,500);
CREATE TABLE organization_plan (organization_id uuid PRIMARY KEY REFERENCES organization(id), plan_revision_id uuid NOT NULL REFERENCES plan_revision(id));
CREATE TABLE setup_invitation (
 id uuid PRIMARY KEY, sender_id uuid NOT NULL REFERENCES platform_account(id), recipient_email varchar(254) COLLATE "C" NOT NULL,
 country varchar(2) NOT NULL CHECK(country IN ('RS','BA')), type varchar(6) NOT NULL CHECK(type IN ('VENDOR','BUYER')),
 plan_revision_id uuid REFERENCES plan_revision(id), reason varchar(1000) NOT NULL,
 token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32), generation bigint NOT NULL DEFAULT 1,
 state varchar(12) NOT NULL CHECK(state IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
 revision bigint NOT NULL DEFAULT 1, created_at timestamptz(3) NOT NULL, updated_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL,
 CHECK((type='VENDOR')=(plan_revision_id IS NOT NULL)), CHECK(expires_at>created_at), CHECK(revision>0 AND generation>0)
);
CREATE UNIQUE INDEX uk_pending_setup_invitation ON setup_invitation(sender_id,recipient_email,country,type) WHERE state='PENDING';
CREATE TABLE setup_email_proof (
 id uuid PRIMARY KEY, invitation_id uuid NOT NULL REFERENCES setup_invitation(id), generation bigint NOT NULL, token_hash bytea NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
 state varchar(12) NOT NULL CHECK(state IN ('ACTIVE','USED','INVALIDATED')), created_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL
);
CREATE UNIQUE INDEX uk_current_setup_proof ON setup_email_proof(invitation_id) WHERE state='ACTIVE';
CREATE TABLE setup_delivery (
 id uuid PRIMARY KEY, invitation_id uuid NOT NULL REFERENCES setup_invitation(id), generation bigint NOT NULL,
 proof_id uuid REFERENCES setup_email_proof(id), encrypted_token bytea NOT NULL CHECK(octet_length(encrypted_token)=71),
 recipient_email varchar(254) NOT NULL, locale varchar(64) NOT NULL, state varchar(12) NOT NULL CHECK(state='QUEUED'), created_at timestamptz(3) NOT NULL
);
CREATE TRIGGER tr_setup_delivery BEFORE UPDATE OR DELETE ON setup_delivery FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TABLE setup_intent (
 id uuid PRIMARY KEY, invitation_id uuid NOT NULL REFERENCES setup_invitation(id), generation bigint NOT NULL,
 tenant_id uuid NOT NULL, provider_user_id uuid NOT NULL, account_id uuid NOT NULL UNIQUE, organization_id uuid NOT NULL UNIQUE,
 payload text NOT NULL, request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
 state varchar(12) NOT NULL CHECK(state IN ('PREPARED','UNKNOWN','APPLIED','REJECTED','COMPLETED','BLOCKED')),
 created_at timestamptz(3) NOT NULL, updated_at timestamptz(3) NOT NULL, completed_at timestamptz(3),
 CHECK((state='COMPLETED')=(completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX uk_live_setup_intent ON setup_intent(invitation_id) WHERE state<>'REJECTED';
CREATE TABLE setup_email_claim (email varchar(254) COLLATE "C" PRIMARY KEY, intent_id uuid NOT NULL UNIQUE REFERENCES setup_intent(id));
CREATE TABLE setup_registration_claim (country varchar(2) NOT NULL,type varchar(6) NOT NULL,identifier varchar(64) COLLATE "C" NOT NULL,intent_id uuid NOT NULL UNIQUE REFERENCES setup_intent(id),PRIMARY KEY(country,type,identifier));
CREATE TABLE invitation_resend (
 sender_id uuid NOT NULL REFERENCES platform_account(id), invitation_id uuid NOT NULL REFERENCES setup_invitation(id), key uuid NOT NULL,
 expected_revision varchar(256) NOT NULL, result_revision bigint NOT NULL, result_generation bigint NOT NULL,
 created_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL, result_expires_at timestamptz(3) NOT NULL, PRIMARY KEY(sender_id,invitation_id,key)
);
CREATE TRIGGER tr_invitation_resend BEFORE UPDATE OR DELETE ON invitation_resend FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION protect_setup_invitation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Invitation history retained' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','revision','token_hash','generation','updated_at','expires_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','token_hash','generation','updated_at','expires_at'])
 OR NEW.revision<>OLD.revision+1 OR OLD.state<>'PENDING'
 OR NOT ((NEW.generation=OLD.generation AND NEW.token_hash=OLD.token_hash AND NEW.expires_at=OLD.expires_at AND NEW.state IN ('ACCEPTED','REVOKED','EXPIRED'))
 OR (NEW.generation=OLD.generation+1 AND NEW.token_hash<>OLD.token_hash AND NEW.state='PENDING' AND NEW.expires_at=NEW.updated_at+interval '168 hours')) THEN
 RAISE EXCEPTION 'Invitation transition invalid' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_setup_invitation BEFORE UPDATE OR DELETE ON setup_invitation FOR EACH ROW EXECUTE FUNCTION protect_setup_invitation();
CREATE FUNCTION protect_setup_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Setup history retained' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','updated_at','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','updated_at','completed_at'])
 OR NOT ((OLD.state='PREPARED' AND NEW.state IN ('UNKNOWN','APPLIED','REJECTED')) OR (OLD.state='UNKNOWN' AND NEW.state IN ('APPLIED','REJECTED'))
 OR (OLD.state='APPLIED' AND NEW.state IN ('COMPLETED','BLOCKED'))) THEN RAISE EXCEPTION 'Setup intent transition invalid' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_setup_intent BEFORE UPDATE OR DELETE ON setup_intent FOR EACH ROW EXECUTE FUNCTION protect_setup_intent();
CREATE FUNCTION protect_setup_proof() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Setup proof history retained' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') OR NOT ((OLD.state='ACTIVE' AND NEW.state IN ('USED','INVALIDATED')) OR (OLD.state='USED' AND NEW.state='INVALIDATED')) THEN RAISE EXCEPTION 'Setup proof transition invalid' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_setup_proof BEFORE UPDATE OR DELETE ON setup_email_proof FOR EACH ROW EXECUTE FUNCTION protect_setup_proof();
CREATE FUNCTION protect_setup_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'DELETE' OR NOT EXISTS(SELECT 1 FROM setup_intent WHERE id=OLD.intent_id AND state IN ('REJECTED','COMPLETED')) THEN RAISE EXCEPTION 'Pending setup claims retained' USING ERRCODE='23514'; END IF; RETURN OLD; END; $$;
CREATE TRIGGER tr_setup_email_claim BEFORE UPDATE OR DELETE ON setup_email_claim FOR EACH ROW EXECUTE FUNCTION protect_setup_claim();
CREATE TRIGGER tr_setup_registration_claim BEFORE UPDATE OR DELETE ON setup_registration_claim FOR EACH ROW EXECUTE FUNCTION protect_setup_claim();
CREATE FUNCTION check_setup_email_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.email=OLD.email THEN RETURN NEW; END IF;
 PERFORM lock_login_email(NEW.email);
 IF EXISTS(SELECT 1 FROM setup_email_claim c JOIN setup_intent s ON s.id=c.intent_id WHERE c.email=NEW.email AND NOT(s.state='APPLIED' AND s.account_id=NEW.id)) THEN RAISE EXCEPTION 'Email held by setup' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_account_setup_email BEFORE INSERT OR UPDATE OF email ON account_identity FOR EACH ROW EXECUTE FUNCTION check_setup_email_hold();
CREATE FUNCTION check_setup_registration_hold() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.country||'/'||NEW.type||'/'||lower(NEW.registration_identifier COLLATE "C"),18001));
 IF EXISTS(SELECT 1 FROM setup_registration_claim c JOIN setup_intent s ON s.id=c.intent_id WHERE c.country=NEW.country AND c.type=NEW.type AND c.identifier=lower(NEW.registration_identifier COLLATE "C") AND NOT(s.state='APPLIED' AND s.organization_id=NEW.id)) THEN RAISE EXCEPTION 'Registration held by setup' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_organization_setup_registration BEFORE INSERT OR UPDATE OF registration_identifier ON organization FOR EACH ROW EXECUTE FUNCTION check_setup_registration_hold();
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
    OR (resource_type='EXTERNAL_IDENTITY' AND action IN ('EXTERNAL_IDENTITY_LINKED','EXTERNAL_IDENTITY_UNLINKED'))
    OR (resource_type='RECOVERY_CASE' AND action IN ('RECOVERY_CREATED','RECOVERY_READ','RECOVERY_APPROVED','RECOVERY_REJECTED','RECOVERY_ACCEPTED','RECOVERY_COMPLETED'))
    OR (resource_type='SETUP' AND actor_type='PLATFORM_ADMIN' AND action IN ('SETUP_INVITED','SETUP_REVOKED','SETUP_RESENT','SETUP_PREPARED','SETUP_APPLIED','SETUP_UNCERTAIN','SETUP_REJECTED','SETUP_COMPLETED','SETUP_BLOCKED'))
);
UPDATE backend_schema_version SET version=18 WHERE id=1;
