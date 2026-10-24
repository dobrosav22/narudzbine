-- Bounded named-platform pages/filter queries; retain all append-only rows and existing indexes/constraints.
CREATE INDEX ix_audit_time ON audit_event(occurred_at DESC,id);
CREATE INDEX ix_audit_action_time ON audit_event(action,occurred_at DESC,id);
UPDATE backend_schema_version SET version=54 WHERE id=1;
