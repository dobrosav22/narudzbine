-- Historical target scope is separate from the administrator's immutable original actor scope.
ALTER TABLE audit_event ADD COLUMN target_organization_id uuid, ADD COLUMN target_country varchar(2);
ALTER TABLE audit_event ADD CONSTRAINT ck_audit_administrative_target CHECK(
 (target_organization_id IS NULL AND target_country IS NULL)
 OR(actor_type='PLATFORM_ADMIN' AND target_organization_id IS NOT NULL AND target_country IS NOT NULL AND target_country IN('RS','BA')));
DO $$ DECLARE previous text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR (actor_type=''PLATFORM_ADMIN'' AND target_organization_id IS NOT NULL AND ((resource_type=''ORGANIZATION'' AND action=''ADMIN_ORGANIZATION_CORRECTED'' AND resource_id=target_organization_id) OR(resource_type=''MEMBER'' AND action IN(''ADMIN_STAFF_DEACTIVATED'',''ADMIN_STAFF_REACTIVATED'')) OR(resource_type=''OWNERSHIP_TRANSFER'' AND action IN(''ADMIN_TRANSFER_EXPIRED'',''ADMIN_TRANSFER_INVALIDATED'')))))',previous);
END $$;
UPDATE backend_schema_version SET version=56 WHERE id=1;
