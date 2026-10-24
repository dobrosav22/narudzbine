ALTER TABLE setup_invitation DROP CONSTRAINT setup_invitation_sender_id_fkey;
ALTER TABLE setup_invitation ADD FOREIGN KEY(sender_id) REFERENCES account_identity(id);
ALTER TABLE invitation_resend DROP CONSTRAINT invitation_resend_sender_id_fkey;
ALTER TABLE invitation_resend ADD FOREIGN KEY(sender_id) REFERENCES account_identity(id);
ALTER TABLE setup_invitation ADD COLUMN purpose varchar(12) NOT NULL DEFAULT 'ORGANIZATION';
ALTER TABLE setup_invitation ADD COLUMN organization_id uuid REFERENCES organization(id);
ALTER TABLE setup_invitation ADD COLUMN invited_role varchar(5);
ALTER TABLE setup_invitation DROP CONSTRAINT setup_invitation_check;
ALTER TABLE setup_invitation ADD CONSTRAINT ck_invitation_purpose CHECK(
 (purpose='ORGANIZATION' AND organization_id IS NULL AND invited_role IS NULL AND ((type='VENDOR')=(plan_revision_id IS NOT NULL)))
 OR (purpose='MEMBER' AND organization_id IS NOT NULL AND invited_role IS NOT NULL AND invited_role IN ('ADMIN','STAFF') AND plan_revision_id IS NULL));
DROP INDEX uk_pending_setup_invitation;
CREATE UNIQUE INDEX uk_pending_setup_invitation ON setup_invitation(sender_id,recipient_email,country,type) WHERE state='PENDING' AND purpose='ORGANIZATION';
CREATE UNIQUE INDEX uk_pending_member_invitation ON setup_invitation(organization_id,recipient_email) WHERE state='PENDING' AND purpose='MEMBER';
CREATE INDEX ix_member_invitation_list ON setup_invitation(organization_id,created_at DESC,id) WHERE purpose='MEMBER';
ALTER TABLE setup_intent ADD COLUMN member_setup boolean NOT NULL DEFAULT false;
ALTER TABLE setup_intent DROP CONSTRAINT setup_intent_organization_id_key;
CREATE UNIQUE INDEX uk_setup_new_organization ON setup_intent(organization_id) WHERE NOT member_setup;
CREATE FUNCTION validate_setup_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_TABLE_NAME='setup_invitation' THEN
  IF NEW.purpose='ORGANIZATION' THEN
   IF NOT EXISTS(SELECT 1 FROM platform_account WHERE id=NEW.sender_id) THEN RAISE EXCEPTION 'Setup requires platform sender' USING ERRCODE='23514'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM organization o JOIN business_account b ON b.organization_id=o.id WHERE o.id=NEW.organization_id AND o.country=NEW.country AND o.type=NEW.type AND b.id=NEW.sender_id) THEN
   RAISE EXCEPTION 'Member invitation requires original organization context' USING ERRCODE='23514';
  END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM setup_invitation i WHERE i.id=NEW.invitation_id AND ((i.purpose='MEMBER' AND NEW.member_setup AND i.organization_id=NEW.organization_id) OR (i.purpose='ORGANIZATION' AND NOT NEW.member_setup))) THEN
  RAISE EXCEPTION 'Setup intent context invalid' USING ERRCODE='23514';
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_setup_context BEFORE INSERT ON setup_invitation FOR EACH ROW EXECUTE FUNCTION validate_setup_context();
CREATE TRIGGER tr_setup_intent_context BEFORE INSERT ON setup_intent FOR EACH ROW EXECUTE FUNCTION validate_setup_context();
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
);
UPDATE backend_schema_version SET version=19 WHERE id=1;
