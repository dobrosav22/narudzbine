-- Schema55. Substitute an isolated validated runtime role; preserve prior audit INSERT grant.
GRANT SELECT,INSERT ON support_access,support_read_evidence TO __RUNTIME_ROLE__;
-- No UPDATE/DELETE/TRUNCATE, DDL or privilege escalation. No support evidence public read endpoint.
