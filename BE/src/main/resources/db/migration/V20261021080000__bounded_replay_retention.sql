-- Additive replay payload expiry access paths. No source, result or history rewrite.
CREATE INDEX ix_stock_replay_retention ON stock_replay(expires_at,actor_id,operation,identity_hash) WHERE original_result IS NOT NULL;
CREATE INDEX ix_inventory_lifecycle_replay_retention ON inventory_lifecycle_replay(expires_at,actor_id,operation,identity_hash) WHERE original_result IS NOT NULL;
CREATE INDEX ix_pricing_deactivation_replay_retention ON pricing_deactivation_replay(expires_at,actor_id,product_id,identity_hash) WHERE original_result IS NOT NULL;
CREATE INDEX ix_message_replay_retention ON message_replay(expires_at,actor_id,organization_id,identity_hash) WHERE original_result IS NOT NULL;
CREATE INDEX ix_order_stage_creation_retention ON order_stage_creation(expires_at,stage_id) WHERE original_result IS NOT NULL;
CREATE INDEX ix_draft_creation_retention ON draft_creation(expires_at,draft_id) WHERE original_snapshot IS NOT NULL;
UPDATE backend_schema_version SET version=60 WHERE id=1;
