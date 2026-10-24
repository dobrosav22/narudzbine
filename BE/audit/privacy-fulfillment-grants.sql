-- Mandatory even while privacy export action/worker flags are disabled.
GRANT SELECT ON privacy_fulfillment_metadata TO __RUNTIME_ROLE__;
GRANT EXECUTE ON FUNCTION expire_privacy_exports(uuid,timestamptz) TO __RUNTIME_ROLE__;

GRANT SELECT ON privacy_redaction_fulfillment_metadata TO __RUNTIME_ROLE__;
