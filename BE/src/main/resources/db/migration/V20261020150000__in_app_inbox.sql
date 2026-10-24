CREATE TABLE notification_preferences(account_id uuid PRIMARY KEY REFERENCES account_identity(id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0));
CREATE TABLE notification_preference(account_id uuid NOT NULL REFERENCES notification_preferences(account_id),event_key varchar(40) NOT NULL CHECK(event_key IN('ORDER_SUBMITTED','ORDER_STATUS_CHANGED','CANCELLATION_REQUESTED','CANCELLATION_RESOLVED','MESSAGE_CREATED','RELATIONSHIP_DISCONNECTED')),in_app boolean NOT NULL,email boolean NOT NULL,push boolean NOT NULL,PRIMARY KEY(account_id,event_key));
CREATE FUNCTION protect_notification_preferences() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Preference identity retained';END IF;
 IF TG_OP='INSERT' THEN IF NEW.revision<>1 THEN RAISE EXCEPTION 'Invalid initial preferences';END IF;
 ELSIF NEW.account_id<>OLD.account_id OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Invalid preference revision';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_notification_preferences BEFORE INSERT OR UPDATE OR DELETE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION protect_notification_preferences();
CREATE VIEW inbox_source WITH(security_invoker=true) AS
 SELECT n.id,'ORDER'::text AS source_kind,n.recipient_account_id,n.organization_id,n.locale,n.created_at,n.order_id,
 CASE WHEN n.event_id IS NULL THEN 'ORDER_SUBMITTED' WHEN e.cancellation_request_state='PENDING' THEN 'CANCELLATION_REQUESTED' WHEN e.cancellation_request_id IS NOT NULL THEN 'CANCELLATION_RESOLVED' ELSE 'ORDER_STATUS_CHANGED' END::text AS event_key,
 COALESCE(e.actor_id,o.submitted_by) AS actor_id,false AS mandatory,g.display_name AS organization_name,o.local_year::text||'-'||o.sequence_number::text AS order_reference
 FROM order_notice n JOIN purchase_order o ON o.id=n.order_id LEFT JOIN purchase_order_event e ON e.id=n.event_id JOIN organization g ON g.id=n.organization_id
 UNION ALL
 SELECT n.id,'MESSAGE',n.recipient_account_id,n.organization_id,n.locale,n.created_at,n.order_id,'MESSAGE_CREATED',m.author_id,false,g.display_name,o.local_year::text||'-'||o.sequence_number::text
 FROM message_notice n JOIN order_message m ON m.id=n.message_id JOIN purchase_order o ON o.id=n.order_id JOIN organization g ON g.id=n.organization_id
 UNION ALL
 SELECT n.id,'RELATIONSHIP',n.recipient_account_id,n.organization_id,n.locale,n.created_at,NULL::uuid,n.event_key,NULL::uuid,false,n.source_name,'' FROM ordinary_notice n
 UNION ALL
 SELECT n.id,'SECURITY',n.recipient_account_id,n.organization_id,n.locale,n.created_at,NULL::uuid,n.event_key,NULL::uuid,true,COALESCE(g.display_name,'Narudzbine'),'' FROM security_notice n LEFT JOIN organization g ON g.id=n.organization_id;
CREATE TABLE inbox_work(
 id uuid PRIMARY KEY,sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,source_kind varchar(16) NOT NULL CHECK(source_kind IN('ORDER','MESSAGE','RELATIONSHIP','SECURITY')),
 recipient_account_id uuid NOT NULL REFERENCES account_identity(id),organization_id uuid REFERENCES organization(id),locale varchar(20) NOT NULL CHECK(locale IN('en','sr-Latn-RS','bs-Latn-BA')),created_at timestamptz(3) NOT NULL,
 order_id uuid REFERENCES purchase_order(id),event_key varchar(40) NOT NULL,actor_id uuid REFERENCES account_identity(id),mandatory boolean NOT NULL,
 organization_name varchar(200) NOT NULL,order_reference varchar(80) NOT NULL,
 state varchar(16) NOT NULL DEFAULT 'QUEUED' CHECK(state IN('QUEUED','PUBLISHED','SUPPRESSED','EXPIRED')),completed_at timestamptz(3),
 CHECK((state='QUEUED')=(completed_at IS NULL)),CHECK(mandatory=(source_kind='SECURITY'))
);
CREATE INDEX ix_inbox_work_queue ON inbox_work(sequence) WHERE state='QUEUED';
CREATE INDEX ix_inbox_work_order ON inbox_work(recipient_account_id,order_id,sequence) WHERE state='QUEUED';
CREATE FUNCTION enqueue_inbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO inbox_work(id,source_kind,recipient_account_id,organization_id,locale,created_at,order_id,event_key,actor_id,mandatory,organization_name,order_reference)
 SELECT id,source_kind,recipient_account_id,organization_id,locale,created_at,order_id,event_key,actor_id,mandatory,organization_name,order_reference FROM inbox_source WHERE id=NEW.id AND source_kind=CASE TG_TABLE_NAME WHEN 'order_notice' THEN 'ORDER' WHEN 'message_notice' THEN 'MESSAGE' WHEN 'ordinary_notice' THEN 'RELATIONSHIP' ELSE 'SECURITY' END;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inbox source missing';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_order_inbox AFTER INSERT ON order_notice FOR EACH ROW EXECUTE FUNCTION enqueue_inbox();
CREATE TRIGGER tr_message_inbox AFTER INSERT ON message_notice FOR EACH ROW EXECUTE FUNCTION enqueue_inbox();
CREATE TRIGGER tr_relationship_inbox AFTER INSERT ON ordinary_notice FOR EACH ROW EXECUTE FUNCTION enqueue_inbox();
CREATE TRIGGER tr_security_inbox AFTER INSERT ON security_notice FOR EACH ROW EXECUTE FUNCTION enqueue_inbox();
INSERT INTO inbox_work(id,source_kind,recipient_account_id,organization_id,locale,created_at,order_id,event_key,actor_id,mandatory,organization_name,order_reference)
 SELECT id,source_kind,recipient_account_id,organization_id,locale,created_at,order_id,event_key,actor_id,mandatory,organization_name,order_reference FROM inbox_source ORDER BY created_at,id;
CREATE FUNCTION protect_inbox_work() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inbox work retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUEUED' OR NOT EXISTS(SELECT 1 FROM inbox_source s WHERE s.id=NEW.id AND (s.source_kind,s.recipient_account_id,s.organization_id,s.locale,s.created_at,s.order_id,s.event_key,s.actor_id,s.mandatory,s.organization_name,s.order_reference) IS NOT DISTINCT FROM (NEW.source_kind,NEW.recipient_account_id,NEW.organization_id,NEW.locale,NEW.created_at,NEW.order_id,NEW.event_key,NEW.actor_id,NEW.mandatory,NEW.organization_name,NEW.order_reference)) THEN RAISE EXCEPTION 'Invalid inbox source';END IF;
 ELSIF (to_jsonb(NEW)-'state'-'completed_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'completed_at') OR OLD.state<>'QUEUED' OR NEW.state='QUEUED' THEN RAISE EXCEPTION 'Inbox work immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_inbox_work BEFORE INSERT OR UPDATE OR DELETE ON inbox_work FOR EACH ROW EXECUTE FUNCTION protect_inbox_work();
CREATE TABLE notification(id uuid PRIMARY KEY REFERENCES inbox_work(id),recipient_account_id uuid NOT NULL REFERENCES account_identity(id),organization_id uuid REFERENCES organization(id),event_key varchar(40) NOT NULL,order_id uuid REFERENCES purchase_order(id),text varchar(4000) NOT NULL CHECK(char_length(text) BETWEEN 1 AND 4000),read boolean NOT NULL DEFAULT false,created_at timestamptz(3) NOT NULL);
CREATE INDEX ix_notification_page ON notification(recipient_account_id,created_at DESC,id);
CREATE FUNCTION protect_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Inbox evidence retained';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.read OR NOT EXISTS(SELECT 1 FROM inbox_work w WHERE w.id=NEW.id AND w.state='QUEUED' AND (w.recipient_account_id,w.organization_id,w.event_key,w.order_id,w.created_at) IS NOT DISTINCT FROM (NEW.recipient_account_id,NEW.organization_id,NEW.event_key,NEW.order_id,NEW.created_at)) THEN RAISE EXCEPTION 'Notification source differs';END IF;
 ELSIF (to_jsonb(NEW)-'read') IS DISTINCT FROM (to_jsonb(OLD)-'read') OR NOT NEW.read THEN RAISE EXCEPTION 'Notification immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_notification BEFORE INSERT OR UPDATE OR DELETE ON notification FOR EACH ROW EXECUTE FUNCTION protect_notification();
CREATE FUNCTION require_inbox_publication() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;BEGIN
 target:=NEW.id;IF EXISTS(SELECT 1 FROM inbox_work w WHERE w.id=target AND ((w.state='PUBLISHED') IS DISTINCT FROM EXISTS(SELECT 1 FROM notification n WHERE n.id=target))) THEN RAISE EXCEPTION 'Inbox publication incomplete';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_inbox_publication AFTER INSERT OR UPDATE ON inbox_work DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_inbox_publication();
CREATE CONSTRAINT TRIGGER ct_notification_publication AFTER INSERT ON notification DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_inbox_publication();
UPDATE backend_schema_version SET version=50 WHERE id=1;
