GRANT UPDATE(retired,organization_name,order_reference) ON inbox_work TO __RUNTIME_ROLE__;
GRANT DELETE,UPDATE(read) ON notification TO __RUNTIME_ROLE__;
-- UPDATE(read) also permits PostgreSQL row locking; ordinary read transitions remain guarded.
GRANT UPDATE(metadata_retired,attempts,next_attempt_at,first_attempt_at,rendered_destination,attempted_device_revision,attempted_token_hash,provider_reference) ON external_job TO __RUNTIME_ROLE__;
GRANT UPDATE(metadata_retired,provider_reference,event_type,received_at) ON email_callback TO __RUNTIME_ROLE__;
-- Existing SELECT on these four tables remains required; no source/callback/job DELETE grant.
