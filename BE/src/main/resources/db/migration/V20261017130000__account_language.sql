ALTER TABLE audit_event DROP CONSTRAINT audit_event_action_check;
ALTER TABLE audit_event DROP CONSTRAINT audit_event_resource_type_check;
ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK (
    (resource_type = 'SESSION' AND action IN ('SESSION_CREATED', 'SESSION_REAUTHENTICATED',
        'SESSION_LOGGED_OUT', 'SESSION_REVOKED', 'SESSION_REVOKED_ALL', 'SESSION_EVICTED'))
    OR (resource_type = 'ACCOUNT' AND action = 'ACCOUNT_LANGUAGE_CHANGED' AND resource_id = actor_id)
);

-- The reviewed resource roster governs supported languages; new languages do not require DDL.
ALTER TABLE account_identity DROP CONSTRAINT account_identity_language_override_check;
ALTER TABLE account_identity ALTER COLUMN language_override TYPE varchar(64);
ALTER TABLE account_identity ADD CONSTRAINT ck_account_language_syntax
    CHECK (language_override ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$');
ALTER TABLE organization DROP CONSTRAINT organization_default_language_check;
ALTER TABLE organization ALTER COLUMN default_language TYPE varchar(64);
ALTER TABLE organization ADD CONSTRAINT ck_organization_language_syntax
    CHECK (default_language ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$');

UPDATE backend_schema_version SET version = 7 WHERE id = 1;
