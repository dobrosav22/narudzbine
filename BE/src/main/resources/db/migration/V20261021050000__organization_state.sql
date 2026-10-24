-- New actual named-administrator events; historical append-only evidence stays unchanged.
DO $$ DECLARE previous text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR (actor_type=''PLATFORM_ADMIN'' AND target_organization_id IS NOT NULL AND resource_type=''ORGANIZATION'' AND resource_id=target_organization_id AND action IN(''ADMIN_ORGANIZATION_SUSPENDED'',''ADMIN_ORGANIZATION_REACTIVATED'')))',previous);
END $$;
UPDATE backend_schema_version SET version=57 WHERE id=1;
