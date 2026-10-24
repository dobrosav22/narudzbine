-- Schema56; substitute an isolated validated runtime role. Retain existing account/session lifecycle grants.
GRANT SELECT ON organization,account_identity,business_account,trading_relationship,plan_change_request TO __RUNTIME_ROLE__;
GRANT UPDATE(display_name,legal_name,registration_identifier,tax_identifier,address_line1,address_line2,address_city,address_postal_code,address_latitude,address_longitude,revision,updated_at) ON organization TO __RUNTIME_ROLE__;
GRANT INSERT ON audit_event TO __RUNTIME_ROLE__;
-- No audit UPDATE/DELETE/TRUNCATE or organization country/type/currency/owner updates through this increment.
