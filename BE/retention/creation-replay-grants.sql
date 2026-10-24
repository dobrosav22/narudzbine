GRANT UPDATE(original_snapshot) ON promotion_creation TO __RUNTIME_ROLE__;
GRANT UPDATE(original_response) ON commercial_export TO __RUNTIME_ROLE__;
-- Existing SELECT/INSERT grants and lifecycle-specific export column grants remain. No DELETE or source/history UPDATE.
