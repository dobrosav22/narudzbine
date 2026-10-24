-- Apply as migration owner after schema52 using a validated isolated runtime role identifier.
-- Add to existing identity/device/inbox/read-only source grants; no schema/provider provisioning.
GRANT SELECT,INSERT ON device_verification TO __RUNTIME_ROLE__;
GRANT UPDATE(state,device_id,device_revision) ON device_verification TO __RUNTIME_ROLE__;
GRANT SELECT ON external_delivery_source TO __RUNTIME_ROLE__;
GRANT SELECT,INSERT ON external_fanout,external_job,email_callback TO __RUNTIME_ROLE__;
GRANT UPDATE(state,attempts,fence,lease_until,next_attempt_at,first_attempt_at,rendered_body,
 rendered_destination,attempted_device_revision,attempted_token_hash,provider_reference,terminal_at)
 ON external_job TO __RUNTIME_ROLE__;
-- Source invoker-security view requires existing notice/order/message/security/invitation/proof/
-- recovery/account/membership/organization SELECT. Existing organization/account guard grants apply.
-- Invitation metadata reads require external_job SELECT even when delivery workers are disabled.
-- No source-body/identity ownership changes, DELETE, direct definer execution or commercial writes.
