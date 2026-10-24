-- Schema54; substitute a validated isolated runtime role. Keep existing append-only INSERT grants.
GRANT SELECT ON audit_event TO __RUNTIME_ROLE__;
-- No UPDATE/DELETE/schema CREATE or privilege escalation. HTTP role/privacy projections still apply.
