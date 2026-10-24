-- Schema58; substitute an isolated validated runtime role. Retain current catalogue/pricing/stock/trading/session grants.
GRANT SELECT ON purchase_order,purchase_order_line,purchase_order_event,organization,trading_relationship,catalogue_product,catalogue_product_identity TO __RUNTIME_ROLE__;
GRANT UPDATE(featured,revision,updated_at) ON catalogue_product TO __RUNTIME_ROLE__;
GRANT INSERT ON audit_event TO __RUNTIME_ROLE__;
-- No order/stock/price/activation/history writes, or audit UPDATE/DELETE/TRUNCATE.
