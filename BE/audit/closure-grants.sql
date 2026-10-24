-- Schema58. Substitute an isolated validated runtime role; retain identity, trading, plan and notification grants.
GRANT SELECT ON organization,account_identity,business_account,platform_account,application_session,purchase_order,purchase_order_event,trading_relationship,setup_invitation,setup_email_proof,ownership_transfer,plan_change_request TO __RUNTIME_ROLE__;
GRANT UPDATE(state,revision,updated_at) ON organization,setup_invitation,ownership_transfer TO __RUNTIME_ROLE__;
GRANT UPDATE(state) ON setup_email_proof TO __RUNTIME_ROLE__;
GRANT UPDATE(state,resolution_reason,revision,updated_at) ON plan_change_request TO __RUNTIME_ROLE__;
GRANT UPDATE(revoked_at) ON application_session TO __RUNTIME_ROLE__;
GRANT UPDATE(state,disconnected_reason,revision,updated_at) ON trading_relationship TO __RUNTIME_ROLE__;
GRANT INSERT ON audit_event,ordinary_notice,ordinary_delivery TO __RUNTIME_ROLE__;
-- Existing device invalidation and partner-snapshot triggers retain their reviewed privilege requirements.
-- No role/owner/country/currency/account-binding changes, provider calls or audit/history deletion.
