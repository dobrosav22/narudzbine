ALTER TABLE setup_invitation ADD COLUMN buyer_id uuid REFERENCES organization(id);
ALTER TABLE setup_invitation DROP CONSTRAINT ck_invitation_purpose;
ALTER TABLE setup_invitation ADD CONSTRAINT ck_invitation_purpose CHECK(
 (purpose='ORGANIZATION' AND organization_id IS NULL AND buyer_id IS NULL AND invited_role IS NULL AND ((type='VENDOR')=(plan_revision_id IS NOT NULL)))
 OR (purpose='MEMBER' AND organization_id IS NOT NULL AND buyer_id IS NULL AND invited_role IS NOT NULL AND invited_role IN ('ADMIN','STAFF') AND plan_revision_id IS NULL)
 OR (purpose='BUYER_SETUP' AND organization_id IS NOT NULL AND buyer_id IS NULL AND invited_role IS NULL AND type='BUYER' AND plan_revision_id IS NULL)
 OR (purpose='TRADING' AND organization_id IS NOT NULL AND buyer_id IS NOT NULL AND invited_role IS NULL AND type='BUYER' AND plan_revision_id IS NULL));
ALTER TABLE setup_invitation DROP CONSTRAINT setup_invitation_state_check;
ALTER TABLE setup_invitation ADD CHECK(state IN ('PENDING','ACCEPTED','REVOKED','EXPIRED','SUPERSEDED'));
CREATE UNIQUE INDEX uk_pending_new_buyer ON setup_invitation(organization_id,recipient_email) WHERE purpose='BUYER_SETUP' AND state='PENDING';
CREATE UNIQUE INDEX uk_pending_trading_pair ON setup_invitation(organization_id,buyer_id) WHERE purpose='TRADING' AND state='PENDING';
CREATE OR REPLACE FUNCTION protect_setup_invitation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Invitation history retained' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','revision','token_hash','generation','updated_at','expires_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','token_hash','generation','updated_at','expires_at'])
 OR NEW.revision<>OLD.revision+1 OR OLD.state<>'PENDING'
 OR NOT ((NEW.generation=OLD.generation AND NEW.token_hash=OLD.token_hash AND NEW.expires_at=OLD.expires_at AND NEW.state IN ('ACCEPTED','REVOKED','EXPIRED','SUPERSEDED'))
 OR (NEW.generation=OLD.generation+1 AND NEW.token_hash<>OLD.token_hash AND NEW.state='PENDING' AND NEW.expires_at=NEW.updated_at+interval '168 hours')) THEN
 RAISE EXCEPTION 'Invitation transition invalid' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION validate_setup_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='setup_invitation' THEN
  IF NEW.purpose='ORGANIZATION' THEN
   IF NOT EXISTS(SELECT 1 FROM platform_account WHERE id=NEW.sender_id) THEN RAISE EXCEPTION 'Setup requires platform sender' USING ERRCODE='23514'; END IF;
  ELSIF NEW.purpose='MEMBER' THEN
   IF NOT EXISTS(SELECT 1 FROM organization o JOIN business_account b ON b.organization_id=o.id WHERE o.id=NEW.organization_id AND o.country=NEW.country AND o.type=NEW.type AND b.id=NEW.sender_id) THEN RAISE EXCEPTION 'Member context invalid' USING ERRCODE='23514'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM organization o JOIN business_account b ON b.organization_id=o.id WHERE o.id=NEW.organization_id AND o.type='VENDOR' AND o.country=NEW.country AND b.id=NEW.sender_id) THEN RAISE EXCEPTION 'Vendor context invalid' USING ERRCODE='23514'; END IF;
   IF NEW.purpose='TRADING' AND NOT EXISTS(SELECT 1 FROM organization WHERE id=NEW.buyer_id AND type='BUYER' AND country=NEW.country) THEN RAISE EXCEPTION 'Domestic buyer required' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM setup_invitation i WHERE i.id=NEW.invitation_id AND ((i.purpose='MEMBER' AND NEW.member_setup AND i.organization_id=NEW.organization_id) OR (i.purpose IN ('ORGANIZATION','BUYER_SETUP') AND NOT NEW.member_setup))) THEN RAISE EXCEPTION 'Setup intent context invalid' USING ERRCODE='23514';
 END IF; RETURN NEW; END; $$;
CREATE TABLE trading_relationship (
 id uuid PRIMARY KEY, vendor_id uuid NOT NULL REFERENCES organization(id),buyer_id uuid NOT NULL REFERENCES organization(id),country varchar(2) NOT NULL CHECK(country IN ('RS','BA')),
 state varchar(12) NOT NULL CHECK(state IN ('ACTIVE','DISCONNECTED')),disconnected_reason varchar(1000),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 connection_generation bigint NOT NULL DEFAULT 1 CHECK(connection_generation>0),agreed_price_confirmation_required boolean NOT NULL DEFAULT false,
 created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL,UNIQUE(vendor_id,buyer_id),CHECK(vendor_id<>buyer_id),
 CHECK((state='ACTIVE' AND disconnected_reason IS NULL) OR (state='DISCONNECTED' AND disconnected_reason IS NOT NULL AND length(btrim(disconnected_reason))>0))
);
CREATE INDEX ix_relationship_vendor ON trading_relationship(vendor_id,state,created_at DESC,id);
CREATE INDEX ix_relationship_buyer ON trading_relationship(buyer_id,state,created_at DESC,id);
CREATE FUNCTION guard_trading_relationship() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE cap integer; parties integer; BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Relationship history retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.vendor_id<>OLD.vendor_id OR NEW.buyer_id<>OLD.buyer_id OR NEW.country<>OLD.country OR NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
   OR NOT ((OLD.state='ACTIVE' AND NEW.state='DISCONNECTED' AND NEW.connection_generation=OLD.connection_generation AND NEW.agreed_price_confirmation_required=OLD.agreed_price_confirmation_required)
    OR (OLD.state='DISCONNECTED' AND NEW.state='ACTIVE' AND NEW.connection_generation=OLD.connection_generation+1 AND NEW.agreed_price_confirmation_required)) THEN RAISE EXCEPTION 'Relationship transition invalid' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM id FROM organization WHERE id IN (NEW.vendor_id,NEW.buyer_id) ORDER BY id FOR UPDATE;
 SELECT count(*) INTO parties FROM organization WHERE (id=NEW.vendor_id AND type='VENDOR' AND country=NEW.country) OR (id=NEW.buyer_id AND type='BUYER' AND country=NEW.country);
 IF parties<>2 THEN RAISE EXCEPTION 'Domestic vendor buyer pair required' USING ERRCODE='23514'; END IF;
 IF NEW.state='ACTIVE' THEN
  IF EXISTS(SELECT 1 FROM organization WHERE id IN (NEW.vendor_id,NEW.buyer_id) AND state<>'ACTIVE') THEN RAISE EXCEPTION 'Active parties required' USING ERRCODE='23514'; END IF;
  SELECT p.active_buyer_limit INTO cap FROM organization_plan a JOIN plan_revision p ON p.id=a.plan_revision_id WHERE a.organization_id=NEW.vendor_id FOR SHARE OF a;
  IF cap IS NULL OR (SELECT count(*) FROM trading_relationship WHERE vendor_id=NEW.vendor_id AND state='ACTIVE' AND id<>NEW.id)>=cap THEN RAISE EXCEPTION 'Plan capacity required' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_trading_guard BEFORE INSERT OR UPDATE OR DELETE ON trading_relationship FOR EACH ROW EXECUTE FUNCTION guard_trading_relationship();
CREATE TABLE trading_acceptance (
 invitation_id uuid PRIMARY KEY REFERENCES setup_invitation(id), relationship_id uuid NOT NULL REFERENCES trading_relationship(id),connection_generation bigint NOT NULL,
 result_revision bigint NOT NULL,result_confirmation boolean NOT NULL,relationship_created_at timestamptz(3) NOT NULL,result_updated_at timestamptz(3) NOT NULL,
 completed_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL
);
CREATE TRIGGER tr_trading_acceptance BEFORE UPDATE OR DELETE ON trading_acceptance FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
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
    OR (resource_type='SETUP' AND (actor_type='PLATFORM_ADMIN' OR (actor_type='BUSINESS' AND organization_id IS NOT NULL)) AND action IN ('SETUP_INVITED','SETUP_REVOKED','SETUP_RESENT','SETUP_PREPARED','SETUP_APPLIED','SETUP_UNCERTAIN','SETUP_REJECTED','SETUP_COMPLETED','SETUP_BLOCKED'))
 OR (resource_type='RELATIONSHIP' AND action IN ('TRADING_CONNECTED','TRADING_RECONNECTED') AND actor_type IN ('BUSINESS','PLATFORM_ADMIN'))
);
UPDATE backend_schema_version SET version=20 WHERE id=1;
