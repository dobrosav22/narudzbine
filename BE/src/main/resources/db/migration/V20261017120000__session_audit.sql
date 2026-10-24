CREATE TABLE audit_event (
    id uuid PRIMARY KEY,
    actor_type varchar(20) NOT NULL CHECK (actor_type IN ('BUSINESS', 'PLATFORM_ADMIN')),
    actor_id uuid NOT NULL REFERENCES account_identity(id),
    -- Historical scope: avoid acquiring an organization FK lock after the account/session locks.
    organization_id uuid,
    country varchar(2) CHECK (country IN ('RS', 'BA')),
    action varchar(40) NOT NULL CHECK (action IN ('SESSION_CREATED', 'SESSION_REAUTHENTICATED',
        'SESSION_LOGGED_OUT', 'SESSION_REVOKED', 'SESSION_REVOKED_ALL', 'SESSION_EVICTED')),
    resource_type varchar(20) NOT NULL CHECK (resource_type = 'SESSION'),
    resource_id uuid NOT NULL,
    outcome varchar(16) NOT NULL CHECK (outcome = 'SUCCESS'),
    request_id uuid NOT NULL,
    occurred_at timestamptz(3) NOT NULL,
    changed_fields text[] NOT NULL CHECK (cardinality(changed_fields) > 0),
    CONSTRAINT ck_audit_actor_scope CHECK (
        (actor_type = 'BUSINESS' AND organization_id IS NOT NULL AND country IS NOT NULL)
        OR (actor_type = 'PLATFORM_ADMIN' AND organization_id IS NULL AND country IS NULL))
);
CREATE INDEX ix_audit_actor_time ON audit_event(actor_id, occurred_at DESC, id);
CREATE INDEX ix_audit_organization_time ON audit_event(organization_id, occurred_at DESC, id);
CREATE INDEX ix_audit_request ON audit_event(request_id);

CREATE FUNCTION protect_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Audit events are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER tr_audit_event_immutable BEFORE UPDATE OR DELETE ON audit_event
    FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_audit_event_no_truncate BEFORE TRUNCATE ON audit_event
    FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();

UPDATE backend_schema_version SET version = 6 WHERE id = 1;
