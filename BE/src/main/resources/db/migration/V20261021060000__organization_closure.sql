-- Permanent closure events; no historical commercial/audit rewrite or physical deletion.
DO $$ DECLARE previous text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR (resource_type=''ORGANIZATION'' AND ((actor_type=''BUSINESS'' AND action=''ORGANIZATION_CLOSED'' AND resource_id=organization_id) OR(actor_type=''PLATFORM_ADMIN'' AND action=''ADMIN_ORGANIZATION_CLOSED'' AND target_organization_id IS NOT NULL AND resource_id=target_organization_id))))',previous);
END $$;
UPDATE backend_schema_version SET version=58 WHERE id=1;
