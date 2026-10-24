CREATE TABLE device_verification(
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES account_identity(id),session_id uuid NOT NULL,
 installation_id uuid NOT NULL,platform varchar(8) NOT NULL,token_hash varchar(64) NOT NULL,code_hash varchar(64) NOT NULL,
 environment varchar(40) NOT NULL,project_id varchar(100) NOT NULL,created_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL,
 state varchar(16) NOT NULL CHECK(state IN('SENDING','ACCEPTED','UNKNOWN','REJECTED','CONSUMED')),device_id uuid REFERENCES push_device(id),device_revision bigint,
 CHECK(expires_at=created_at+interval '120 seconds'),CHECK((state='CONSUMED')=(device_id IS NOT NULL)),CHECK((device_id IS NULL)=(device_revision IS NULL))
);
CREATE INDEX ix_device_verification_context ON device_verification(account_id,session_id,installation_id,created_at DESC);
CREATE FUNCTION protect_device_verification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'state'-'device_id'-'device_revision') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'device_id'-'device_revision')
 OR OLD.state IN('REJECTED','CONSUMED') OR NEW.state NOT IN('ACCEPTED','UNKNOWN','REJECTED','CONSUMED') THEN RAISE EXCEPTION 'Invalid device verification transition';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_device_verification BEFORE UPDATE OR DELETE ON device_verification FOR EACH ROW EXECUTE FUNCTION protect_device_verification();
CREATE VIEW external_delivery_source WITH(security_invoker=true) AS
 WITH notices AS(
 SELECT 'NOTICE_ORDER'::text AS kind,id,notice_id,channel,created_at,expires_at FROM order_delivery WHERE channel IN('EMAIL','PUSH')
 UNION ALL SELECT 'NOTICE_MESSAGE',id,notice_id,channel,created_at,expires_at FROM message_delivery WHERE channel IN('EMAIL','PUSH')
 UNION ALL SELECT 'NOTICE_RELATIONSHIP',id,notice_id,channel,created_at,expires_at FROM ordinary_delivery WHERE channel IN('EMAIL','PUSH')
 ) SELECT d.kind,d.id,d.channel,s.recipient_account_id AS account_id,s.organization_id,
 CASE WHEN s.organization_id=o.vendor_id THEN o.buyer_id ELSE o.vendor_id END AS other_organization_id,
 s.locale,s.event_key,d.created_at,d.expires_at,false AS mandatory,false AS manual,NULL::text AS destination_email,COALESCE(s.order_id,rn.relationship_id,s.id) AS resource_id,s.id AS notice_id
 FROM notices d JOIN inbox_source s ON s.id=d.notice_id AND 'NOTICE_'||s.source_kind=d.kind LEFT JOIN purchase_order o ON o.id=s.order_id LEFT JOIN ordinary_notice rn ON d.kind='NOTICE_RELATIONSHIP' AND rn.id=s.id
 UNION ALL SELECT 'SECURITY',d.id,'EMAIL',s.recipient_account_id,s.organization_id,NULL::uuid,s.locale,s.event_key,d.created_at,d.created_at+interval '24 hours',true,false,d.destination_email,s.resource_id,s.id FROM outbox_event d JOIN security_notice s ON s.id=d.notice_id
 UNION ALL SELECT 'SETUP',d.id,'EMAIL',i.sender_id,i.organization_id,i.buyer_id,d.locale,CASE WHEN d.proof_id IS NULL THEN 'INVITATION' ELSE 'INVITATION_PROOF' END,d.created_at,LEAST(i.expires_at,COALESCE(p.expires_at,i.expires_at)),true,true,d.recipient_email,i.id,NULL::uuid FROM setup_delivery d JOIN setup_invitation i ON i.id=d.invitation_id LEFT JOIN setup_email_proof p ON p.id=d.proof_id
 UNION ALL SELECT 'RESET',d.proof_id,'EMAIL',p.account_id,b.organization_id,NULL::uuid,d.locale,'PASSWORD_RESET',d.created_at,p.expires_at,true,false,p.email,p.id,NULL::uuid FROM password_reset_delivery d JOIN password_reset_proof p ON p.id=d.proof_id LEFT JOIN business_account b ON b.id=p.account_id
 UNION ALL SELECT 'EMAIL_PROOF',d.proof_id,'EMAIL',e.account_id,b.organization_id,NULL::uuid,d.locale,'EMAIL_PROOF',d.created_at,e.expires_at,true,false,CASE WHEN p.side='OLD' THEN e.old_email ELSE e.new_email END,e.id,NULL::uuid FROM email_change_delivery d JOIN email_change_proof p ON p.id=d.proof_id JOIN email_change e ON e.id=p.change_id LEFT JOIN business_account b ON b.id=e.account_id
 UNION ALL SELECT 'RECOVERY',d.id,'EMAIL',d.recipient_id,c.organization_id,NULL::uuid,d.locale,CASE WHEN d.kind='NOTICE' THEN 'RECOVERY_NOTICE' ELSE 'RECOVERY_ACCEPTANCE' END,d.created_at,c.expires_at,true,false,d.destination_email,c.id,NULL::uuid FROM recovery_delivery d JOIN recovery_case c ON c.id=d.case_id;
CREATE TABLE external_fanout(source_kind varchar(32) NOT NULL,source_id uuid NOT NULL,created_at timestamptz(3) NOT NULL,PRIMARY KEY(source_kind,source_id));
CREATE TRIGGER tr_external_fanout BEFORE UPDATE OR DELETE ON external_fanout FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TABLE external_job(
 id uuid PRIMARY KEY,source_kind varchar(32) NOT NULL,source_id uuid NOT NULL,channel varchar(5) NOT NULL CHECK(channel IN('EMAIL','PUSH')),device_id uuid REFERENCES push_device(id),
 state varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK(state IN('QUEUED','SENDING','ACCEPTED','DELIVERED','FAILED','UNKNOWN','SUPPRESSED','EXPIRED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6),fence uuid,lease_until timestamptz(3),next_attempt_at timestamptz(3) NOT NULL,first_attempt_at timestamptz(3),
 rendered_body bytea,rendered_destination varchar(254),attempted_device_revision bigint,attempted_token_hash varchar(64),provider_reference varchar(600),terminal_at timestamptz(3),created_at timestamptz(3) NOT NULL,
 UNIQUE NULLS NOT DISTINCT(source_kind,source_id,device_id),FOREIGN KEY(source_kind,source_id) REFERENCES external_fanout(source_kind,source_id),CHECK((state='SENDING')=(lease_until IS NOT NULL)),CHECK((state='SENDING')=(fence IS NOT NULL)),CHECK(channel='PUSH' OR device_id IS NULL)
);
CREATE INDEX ix_external_job_queue ON external_job(channel,next_attempt_at,created_at,id) WHERE state IN('QUEUED','SENDING');
CREATE UNIQUE INDEX ux_external_job_provider_reference ON external_job(provider_reference) WHERE provider_reference IS NOT NULL;
CREATE FUNCTION protect_external_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (NEW.id,NEW.source_kind,NEW.source_id,NEW.channel,NEW.device_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.source_kind,OLD.source_id,OLD.channel,OLD.device_id,OLD.created_at)
 OR NEW.attempts<OLD.attempts OR NEW.attempts>OLD.attempts+1 OR (OLD.rendered_body IS NOT NULL AND NEW.rendered_body IS NOT NULL AND (NEW.rendered_body,NEW.rendered_destination) IS DISTINCT FROM (OLD.rendered_body,OLD.rendered_destination))
 OR (OLD.state IN('DELIVERED','FAILED','SUPPRESSED','EXPIRED') AND (to_jsonb(NEW)-'rendered_body') IS DISTINCT FROM (to_jsonb(OLD)-'rendered_body')) THEN RAISE EXCEPTION 'Invalid external job transition';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_external_job BEFORE UPDATE OR DELETE ON external_job FOR EACH ROW EXECUTE FUNCTION protect_external_job();
CREATE TABLE email_callback(id varchar(512) PRIMARY KEY,payload_hash varchar(64) NOT NULL,provider_reference uuid NOT NULL,event_type varchar(40) NOT NULL,received_at timestamptz(3) NOT NULL);
CREATE INDEX ix_email_callback_reference ON email_callback(provider_reference);
CREATE TRIGGER tr_email_callback BEFORE UPDATE OR DELETE ON email_callback FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
UPDATE backend_schema_version SET version=52 WHERE id=1;
