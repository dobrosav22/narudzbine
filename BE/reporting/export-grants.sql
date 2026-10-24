-- Apply as schema owner after schema53, substituting the validated isolated runtime role.
-- Add to existing identity/session/organization and commercial read grants.
GRANT SELECT,INSERT ON commercial_export TO __RUNTIME_ROLE__;
GRANT UPDATE(state,revision,completed_at,expires_at,failure_code,artifact,digest,byte_count,row_count)
 ON commercial_export TO __RUNTIME_ROLE__;
-- Existing SELECT on purchase_order, purchase_order_line, purchase_order_event,
-- trading_relationship, organization, business_account and account_identity;
-- existing organization/account guard and append-only audit INSERT grants.
-- No DELETE, ownership/date UPDATE, schema CREATE or definer function grant.
-- After schema61 also apply retention/creation-replay-grants.sql for one-way original-response compaction; lifecycle/source guards still apply.

-- Schema69: preserve expired encrypted bytes under a hold; access remains EXPIRED.
GRANT UPDATE(artifact_held) ON commercial_export TO __RUNTIME_ROLE__;
