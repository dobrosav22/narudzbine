-- Execute by the migration owner after independently creating an isolated LOGIN.
-- Replace __PROCESSING_ROLE__ with a validated SQL identifier, never a secret.
GRANT USAGE ON SCHEMA public TO __PROCESSING_ROLE__;
GRANT SELECT(id) ON organization TO __PROCESSING_ROLE__;
GRANT SELECT ON media_asset,media_upload,media_processing_job,catalogue_product_gallery TO __PROCESSING_ROLE__;
GRANT UPDATE(id) ON organization TO __PROCESSING_ROLE__;
GRANT UPDATE(state,revision,failure_code,processed_key,processed_sha256,processed_bytes,width,height,ready_at,unreferenced_at) ON media_asset TO __PROCESSING_ROLE__;
GRANT UPDATE(progress_at,raw_deleted_at) ON media_upload TO __PROCESSING_ROLE__;
GRANT UPDATE(state,fence,lease_until,attempts) ON media_processing_job TO __PROCESSING_ROLE__;
GRANT INSERT ON media_upload_event TO __PROCESSING_ROLE__;

-- Schema69: durable destruction claims precede provider I/O; no claim table DML.
GRANT EXECUTE ON FUNCTION claim_media_disposal(uuid,text,timestamptz),complete_media_disposal(uuid,text,timestamptz) TO __PROCESSING_ROLE__;
