CREATE TABLE recovery_case (
    id uuid PRIMARY KEY,
    creator_id uuid NOT NULL REFERENCES platform_account(id),
    creator_epoch bigint NOT NULL,
    reviewer_id uuid REFERENCES platform_account(id),
    reviewer_epoch bigint,
    organization_id uuid NOT NULL REFERENCES organization(id),
    target_id uuid NOT NULL,
    former_owner_id uuid NOT NULL,
    target_epoch bigint NOT NULL,
    target_generation bigint NOT NULL,
    owner_epoch bigint NOT NULL,
    owner_generation bigint NOT NULL,
    kind varchar(5) NOT NULL CHECK(kind IN ('OWNER','EMAIL')),
    old_email varchar(254) NOT NULL,
    new_email varchar(254),
    reason varchar(1000) NOT NULL,
    evidence_reference varchar(200) NOT NULL,
    review_reason varchar(1000),
    review_reference varchar(200),
    request_digest bytea NOT NULL CHECK(octet_length(request_digest)=32),
    state varchar(20) NOT NULL CHECK(state IN ('EVIDENCE_REVIEW','NOTICE_PERIOD','RECONCILING','COMPLETED','REJECTED')),
    revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
    token_hash bytea CHECK(octet_length(token_hash)=32),
    consumed_at timestamptz(3),
    email_change_id uuid UNIQUE REFERENCES email_change(id),
    created_at timestamptz(3) NOT NULL,
    not_before timestamptz(3) NOT NULL,
    expires_at timestamptz(3) NOT NULL,
    updated_at timestamptz(3) NOT NULL,
    FOREIGN KEY(organization_id,target_id) REFERENCES business_account(organization_id,id),
    FOREIGN KEY(organization_id,former_owner_id) REFERENCES business_account(organization_id,id),
    CHECK((kind='EMAIL' AND new_email IS NOT NULL AND new_email<>old_email) OR (kind='OWNER' AND new_email IS NULL AND target_id<>former_owner_id)),
    CHECK(not_before>=created_at+interval '24 hours' AND expires_at=not_before+interval '168 hours'),
    CHECK(reviewer_id IS NULL OR reviewer_id<>creator_id),
    CHECK((reviewer_id IS NULL)=(reviewer_epoch IS NULL)),
    CHECK(state<>'NOTICE_PERIOD' OR (reviewer_id IS NOT NULL AND token_hash IS NOT NULL)),
    CHECK(state<>'RECONCILING' OR (kind='EMAIL' AND email_change_id IS NOT NULL AND consumed_at IS NOT NULL))
);
CREATE INDEX ix_recovery_target ON recovery_case(target_id);
CREATE TABLE recovery_delivery (
    id uuid PRIMARY KEY,
    case_id uuid NOT NULL REFERENCES recovery_case(id),
    kind varchar(12) NOT NULL CHECK(kind IN ('NOTICE','ACCEPTANCE')),
    recipient_id uuid NOT NULL REFERENCES account_identity(id),
    destination_email varchar(254) NOT NULL,
    encrypted_token bytea,
    locale varchar(64) NOT NULL,
    state varchar(12) NOT NULL CHECK(state='QUEUED'),
    created_at timestamptz(3) NOT NULL,
    UNIQUE(case_id,kind,recipient_id),
    CHECK((kind='NOTICE' AND encrypted_token IS NULL) OR (kind='ACCEPTANCE' AND octet_length(encrypted_token)=71))
);
CREATE TRIGGER tr_recovery_delivery BEFORE UPDATE OR DELETE ON recovery_delivery FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION protect_recovery_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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
CREATE TRIGGER tr_recovery_case BEFORE UPDATE OR DELETE ON recovery_case FOR EACH ROW EXECUTE FUNCTION protect_recovery_case();
ALTER TABLE audit_event ADD COLUMN reason varchar(1000);
ALTER TABLE security_notice ADD COLUMN recovery_case_id uuid REFERENCES recovery_case(id);
ALTER TABLE security_notice DROP CONSTRAINT security_notice_event_key_check;
ALTER TABLE security_notice ADD CHECK(event_key IN ('OWNER_CHANGED','PASSWORD_CHANGED','EMAIL_CHANGE_STARTED','EMAIL_CHANGED','RECOVERY_COMPLETED'));
ALTER TABLE security_notice DROP CONSTRAINT security_notice_check;
ALTER TABLE security_notice ADD CHECK (
    (event_key='OWNER_CHANGED' AND organization_id IS NOT NULL AND credential_operation_id IS NULL AND email_change_id IS NULL
        AND ((ownership_transfer_id IS NOT NULL AND resource_id=ownership_transfer_id AND recovery_case_id IS NULL)
            OR (recovery_case_id IS NOT NULL AND resource_id=recovery_case_id AND ownership_transfer_id IS NULL)))
    OR (event_key='PASSWORD_CHANGED' AND credential_operation_id IS NOT NULL AND resource_id=credential_operation_id
        AND ownership_transfer_id IS NULL AND email_change_id IS NULL AND recovery_case_id IS NULL)
    OR (event_key IN ('EMAIL_CHANGE_STARTED','EMAIL_CHANGED') AND email_change_id IS NOT NULL AND resource_id=email_change_id
        AND ownership_transfer_id IS NULL AND recovery_case_id IS NULL AND (event_key='EMAIL_CHANGE_STARTED')=(credential_operation_id IS NULL))
    OR (event_key='RECOVERY_COMPLETED' AND recovery_case_id IS NOT NULL AND resource_id=recovery_case_id
        AND ownership_transfer_id IS NULL AND credential_operation_id IS NULL AND email_change_id IS NULL)
);
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
);
UPDATE backend_schema_version SET version=17 WHERE id=1;
