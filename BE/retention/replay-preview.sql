-- psql --set=retention_at=<UTC instant> --file=replay-preview.sql using SELECT-only credentials.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT 'location_creation' AS family,count(*) AS expired_payloads FROM location_creation WHERE original_snapshot IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'contact_creation' AS family,count(*) AS expired_payloads FROM contact_creation WHERE original_snapshot IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'taxonomy_creation' AS family,count(*) AS expired_payloads FROM taxonomy_creation WHERE original_snapshot IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'product_creation' AS family,count(*) AS expired_payloads FROM product_creation WHERE original_snapshot IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'draft_creation' AS family,count(*) AS expired_payloads FROM draft_creation WHERE original_snapshot IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'stock_replay' AS family,count(*) AS expired_payloads FROM stock_replay WHERE original_result IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'inventory_lifecycle_replay' AS family,count(*) AS expired_payloads FROM inventory_lifecycle_replay WHERE original_result IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'pricing_deactivation_replay' AS family,count(*) AS expired_payloads FROM pricing_deactivation_replay WHERE original_result IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'message_replay' AS family,count(*) AS expired_payloads FROM message_replay WHERE original_result IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'order_submission_replay' AS family,count(*) AS expired_payloads FROM order_submission_replay WHERE original_result IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'order_stage_creation' AS family,count(*) AS expired_payloads FROM order_stage_creation WHERE original_result IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'promotion_creation' AS family,count(*) AS expired_payloads FROM promotion_creation WHERE original_snapshot IS NOT NULL AND expires_at<=:'retention_at'::timestamptz
UNION ALL
SELECT 'commercial_export' AS family,count(*) AS expired_payloads FROM commercial_export WHERE original_response IS NOT NULL AND created_at<=:'retention_at'::timestamptz-interval '7 days'
ORDER BY family;
ROLLBACK;
