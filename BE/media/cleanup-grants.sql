-- Apply as migration owner after schema49, using an existing isolated HTTP/runtime role.
-- Replace __RUNTIME_ROLE__ with a validated SQL identifier. Existing upload/gallery grants remain necessary.
GRANT SELECT,INSERT ON media_cleanup_event TO __RUNTIME_ROLE__;
GRANT UPDATE(processed_deleted_at) ON media_asset TO __RUNTIME_ROLE__;
-- Never grant this role processed_key/hash/size/dimension/ready_at writes.

-- Schema69: durable destruction claims precede provider I/O; no claim table DML.
GRANT EXECUTE ON FUNCTION claim_media_disposal(uuid,text,timestamptz),complete_media_disposal(uuid,text,timestamptz) TO __RUNTIME_ROLE__;
