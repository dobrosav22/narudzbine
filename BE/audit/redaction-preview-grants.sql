-- Add only to the qualified assisted-review runtime with existing private-review grants.
GRANT EXECUTE ON FUNCTION inspect_redaction_preview(uuid,bytea,uuid,uuid,text,timestamptz) TO __RUNTIME_ROLE__;
-- No source SELECT, UPDATE/DELETE, qualification management or redaction execution grant.
