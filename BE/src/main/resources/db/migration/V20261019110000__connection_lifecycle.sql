CREATE TABLE ordinary_notice (
 id uuid PRIMARY KEY,event_key varchar(40) NOT NULL CHECK(event_key='RELATIONSHIP_DISCONNECTED'),
 relationship_id uuid NOT NULL REFERENCES trading_relationship(id),relationship_revision bigint NOT NULL CHECK(relationship_revision>0),
 organization_id uuid NOT NULL,recipient_account_id uuid NOT NULL,
 locale varchar(64) NOT NULL,source_name varchar(200) NOT NULL,created_at timestamptz(3) NOT NULL,
 FOREIGN KEY(organization_id,recipient_account_id) REFERENCES business_account(organization_id,id),
 UNIQUE(event_key,relationship_id,relationship_revision,recipient_account_id)
);
CREATE TRIGGER tr_ordinary_notice BEFORE UPDATE OR DELETE ON ordinary_notice FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TABLE ordinary_delivery (
 id uuid PRIMARY KEY,notice_id uuid NOT NULL REFERENCES ordinary_notice(id),
 channel varchar(8) NOT NULL CHECK(channel IN ('IN_APP','EMAIL','PUSH')),
 state varchar(16) NOT NULL CHECK(state='QUEUED'),created_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL,
 UNIQUE(notice_id,channel),CHECK(expires_at=created_at+interval '24 hours')
);
CREATE INDEX ix_ordinary_delivery_queue ON ordinary_delivery(state,created_at,id);
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
 OR (resource_type='RELATIONSHIP' AND action IN ('TRADING_CONNECTED','TRADING_RECONNECTED','TRADING_ADMIN_CONNECTED','TRADING_DISCONNECTED') AND actor_type IN ('BUSINESS','PLATFORM_ADMIN'))
);
UPDATE backend_schema_version SET version=21 WHERE id=1;
