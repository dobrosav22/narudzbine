CREATE TABLE support_access (
 id uuid PRIMARY KEY, administrator_id uuid NOT NULL REFERENCES platform_account(id),
 organization_id uuid NOT NULL REFERENCES organization(id), country varchar(2) NOT NULL CHECK(country IN('RS','BA')),
 security_epoch bigint NOT NULL CHECK(security_epoch>=0), credential_generation bigint NOT NULL CHECK(credential_generation>=0),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 1000 AND length(btrim(reason))>0),
 case_reference text NOT NULL CHECK(char_length(case_reference) BETWEEN 1 AND 100 AND length(btrim(case_reference))>0),
 created_at timestamptz(3) NOT NULL, expires_at timestamptz(3) NOT NULL CHECK(expires_at=created_at+interval '30 minutes')
);
CREATE INDEX ix_support_actor_time ON support_access(administrator_id,created_at DESC,id);
CREATE TRIGGER tr_support_access_immutable BEFORE UPDATE OR DELETE ON support_access FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_support_access_no_truncate BEFORE TRUNCATE ON support_access FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
CREATE TABLE support_read_evidence (
 audit_id uuid PRIMARY KEY REFERENCES audit_event(id), context_id uuid NOT NULL REFERENCES support_access(id),
 organization_id uuid NOT NULL, country varchar(2) NOT NULL CHECK(country IN('RS','BA')),
 resource_type varchar(24) NOT NULL CHECK(resource_type IN('REPORT','ORDER','PRODUCTS','MESSAGES','PRICING','STOCK','PROMOTIONS','AGREED_PRICES')),
 resource_id uuid NOT NULL, filters jsonb NOT NULL CHECK(jsonb_typeof(filters)='object')
);
CREATE INDEX ix_support_read_context ON support_read_evidence(context_id,audit_id);
CREATE TRIGGER tr_support_read_immutable BEFORE UPDATE OR DELETE ON support_read_evidence FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_support_read_no_truncate BEFORE TRUNCATE ON support_read_evidence FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
DO $$ DECLARE previous text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT previous FROM pg_constraint WHERE conrelid='audit_event'::regclass AND conname='ck_audit_action_resource';
 ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
 EXECUTE format('ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK ((%s) OR (resource_type=''SUPPORT_ACCESS'' AND actor_type=''PLATFORM_ADMIN'' AND action IN(''SUPPORT_ACCESS_CREATED'',''COMMERCIAL_SUPPORT_READ'')))',previous);
END $$;
UPDATE backend_schema_version SET version=55 WHERE id=1;
