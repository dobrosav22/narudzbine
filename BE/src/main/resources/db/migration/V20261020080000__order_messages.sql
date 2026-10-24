-- Immutable plain-text threads, targeted original successes and counterpart notification intents.
CREATE TABLE order_message(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES purchase_order(id),author_organization_id uuid NOT NULL REFERENCES organization(id),author_id uuid NOT NULL REFERENCES account_identity(id),author_display_name varchar(100) NOT NULL,text varchar(4000) NOT NULL CHECK(char_length(btrim(text)) BETWEEN 1 AND 4000),created_at timestamptz(3) NOT NULL,UNIQUE(id,order_id));
CREATE INDEX ix_order_message_page ON order_message(order_id,created_at,id);
CREATE TRIGGER tr_order_message_immutable BEFORE UPDATE OR DELETE ON order_message FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_order_message() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE o purchase_order%ROWTYPE;state text;BEGIN
 SELECT * INTO o FROM purchase_order WHERE id=NEW.order_id;SELECT e.state INTO state FROM purchase_order_event e WHERE e.order_id=o.id ORDER BY revision DESC LIMIT 1;
 IF o.id IS NULL OR NEW.author_organization_id NOT IN(o.buyer_id,o.vendor_id) OR NEW.created_at<o.submitted_at OR NOT EXISTS(SELECT 1 FROM business_account b JOIN account_identity a ON a.id=b.id JOIN organization g ON g.id=b.organization_id WHERE b.id=NEW.author_id AND b.organization_id=NEW.author_organization_id AND a.state='ACTIVE' AND a.email_verified AND a.display_name=NEW.author_display_name AND g.state='ACTIVE') THEN RAISE EXCEPTION 'Invalid message author/source';END IF;
 IF state NOT IN('AWAITING_ACCEPTANCE','ACCEPTED','DISPATCHED') AND NOT EXISTS(SELECT 1 FROM trading_relationship r WHERE r.vendor_id=o.vendor_id AND r.buyer_id=o.buyer_id AND r.state='ACTIVE') THEN RAISE EXCEPTION 'Disconnected terminal thread read only';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_order_message_scope BEFORE INSERT ON order_message FOR EACH ROW EXECUTE FUNCTION guard_order_message();
CREATE TABLE message_replay(actor_id uuid NOT NULL REFERENCES account_identity(id),organization_id uuid NOT NULL REFERENCES organization(id),identity_hash bytea NOT NULL CHECK(octet_length(identity_hash)=32),order_id uuid NOT NULL,payload_hash bytea NOT NULL CHECK(octet_length(payload_hash)=32),message_id uuid NOT NULL UNIQUE,original_result jsonb,created_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL,PRIMARY KEY(actor_id,organization_id,identity_hash),FOREIGN KEY(message_id,order_id) REFERENCES order_message(id,order_id),CHECK(expires_at=created_at+interval '7 days'));
CREATE FUNCTION guard_message_replay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.original_result IS NULL AND OLD.original_result IS NOT NULL AND to_jsonb(NEW)-'original_result'=to_jsonb(OLD)-'original_result' THEN RETURN NEW;END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Message replay identity retained';END IF;
 IF NEW.original_result IS NULL OR NOT EXISTS(SELECT 1 FROM order_message m WHERE m.id=NEW.message_id AND m.order_id=NEW.order_id AND m.author_id=NEW.actor_id AND m.author_organization_id=NEW.organization_id AND m.created_at=NEW.created_at AND (NEW.original_result->>'id')::uuid=m.id AND(NEW.original_result->>'orderId')::uuid=m.order_id AND(NEW.original_result->>'authorOrganizationId')::uuid=m.author_organization_id AND(NEW.original_result->>'authorAccountId')::uuid=m.author_id AND NEW.original_result->>'authorDisplayName'=m.author_display_name AND NEW.original_result->>'text'=m.text AND(NEW.original_result->>'createdAt')::timestamptz=m.created_at) THEN RAISE EXCEPTION 'Invalid message success';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_message_replay BEFORE INSERT OR UPDATE OR DELETE ON message_replay FOR EACH ROW EXECUTE FUNCTION guard_message_replay();
CREATE TABLE message_notice(id uuid PRIMARY KEY,message_id uuid NOT NULL,order_id uuid NOT NULL,organization_id uuid NOT NULL REFERENCES organization(id),recipient_account_id uuid NOT NULL REFERENCES account_identity(id),locale varchar(20) NOT NULL CHECK(locale IN('en','sr-Latn-RS','bs-Latn-BA')),created_at timestamptz(3) NOT NULL,FOREIGN KEY(message_id,order_id) REFERENCES order_message(id,order_id),UNIQUE(message_id,recipient_account_id));
CREATE TRIGGER tr_message_notice_immutable BEFORE UPDATE OR DELETE ON message_notice FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_message_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM order_message m JOIN purchase_order o ON o.id=m.order_id JOIN business_account b ON b.id=NEW.recipient_account_id JOIN account_identity a ON a.id=b.id JOIN organization g ON g.id=b.organization_id WHERE m.id=NEW.message_id AND m.order_id=NEW.order_id AND b.organization_id=NEW.organization_id AND b.organization_id=CASE WHEN m.author_organization_id=o.buyer_id THEN o.vendor_id ELSE o.buyer_id END AND a.state='ACTIVE' AND a.email_verified AND g.state='ACTIVE' AND NEW.locale=COALESCE(a.language_override,g.default_language) AND NEW.created_at=m.created_at) THEN RAISE EXCEPTION 'Invalid message recipient';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_message_notice_scope BEFORE INSERT ON message_notice FOR EACH ROW EXECUTE FUNCTION guard_message_notice();
CREATE TABLE message_delivery(id uuid PRIMARY KEY,notice_id uuid NOT NULL REFERENCES message_notice(id),channel varchar(10) NOT NULL CHECK(channel IN('IN_APP','EMAIL','PUSH')),state varchar(20) NOT NULL CHECK(state IN('QUEUED','SENDING','ACCEPTED','DELIVERED','FAILED','UNKNOWN')),created_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL,UNIQUE(notice_id,channel),CHECK(expires_at=created_at+interval '1 day'));
CREATE FUNCTION guard_message_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.state<>'QUEUED' OR NOT EXISTS(SELECT 1 FROM message_notice n WHERE n.id=NEW.notice_id AND n.created_at=NEW.created_at) THEN RAISE EXCEPTION 'Invalid message delivery intent';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_message_delivery_scope BEFORE INSERT ON message_delivery FOR EACH ROW EXECUTE FUNCTION guard_message_delivery();
CREATE FUNCTION validate_message_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM message_replay r WHERE r.message_id=NEW.id AND r.order_id=NEW.order_id AND r.actor_id=NEW.author_id AND r.organization_id=NEW.author_organization_id) THEN RAISE EXCEPTION 'Message replay missing';END IF;
 IF EXISTS(SELECT 1 FROM purchase_order o JOIN business_account b ON b.organization_id=CASE WHEN NEW.author_organization_id=o.buyer_id THEN o.vendor_id ELSE o.buyer_id END JOIN account_identity a ON a.id=b.id JOIN organization g ON g.id=b.organization_id WHERE o.id=NEW.order_id AND g.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND NOT EXISTS(SELECT 1 FROM message_notice n WHERE n.message_id=NEW.id AND n.recipient_account_id=a.id AND(SELECT count(*) FROM message_delivery d WHERE d.notice_id=n.id)=3)) THEN RAISE EXCEPTION 'Message notification intent missing';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_message_complete AFTER INSERT ON order_message DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_message_complete();
ALTER TABLE audit_event DROP CONSTRAINT ck_audit_action_resource;
ALTER TABLE audit_event ADD CONSTRAINT ck_audit_action_resource CHECK (
    (resource_type = 'SESSION' AND action IN ('SESSION_CREATED', 'SESSION_REAUTHENTICATED',
        'SESSION_LOGGED_OUT', 'SESSION_REVOKED', 'SESSION_REVOKED_ALL', 'SESSION_EVICTED','SESSION_PASSWORD_ROTATED'))
    OR (resource_type = 'ACCOUNT' AND action IN ('ACCOUNT_LANGUAGE_CHANGED','ACCOUNT_PROFILE_UPDATED') AND resource_id = actor_id)
    OR (resource_type = 'ORGANIZATION' AND action = 'ORGANIZATION_UPDATED' AND actor_type = 'BUSINESS'
        AND organization_id IS NOT NULL AND resource_id = organization_id)
    OR (resource_type = 'LOCATION' AND action IN ('LOCATION_CREATED','LOCATION_UPDATED','LOCATION_ARCHIVED','LOCATION_RESTORED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type = 'CONTACT' AND action IN ('CONTACT_CREATED','CONTACT_UPDATED','CONTACT_ARCHIVED','CONTACT_RESTORED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type = 'MEMBER' AND action IN ('MEMBER_ROLE_CHANGED','MEMBER_DEACTIVATED','MEMBER_REACTIVATED')
        AND actor_type = 'BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type='OWNERSHIP_TRANSFER' AND action IN ('TRANSFER_REQUESTED','TRANSFER_REVOKED','TRANSFER_INVALIDATED','TRANSFER_EXPIRED','TRANSFER_ACCEPTED')
        AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
    OR (resource_type='CREDENTIAL_OPERATION' AND action IN ('PASSWORD_OPERATION_STARTED','PASSWORD_OPERATION_APPLIED',
        'PASSWORD_OPERATION_UNCERTAIN','PASSWORD_OPERATION_REJECTED','PASSWORD_OPERATION_COMPLETED',
        'EMAIL_OPERATION_STARTED','EMAIL_OPERATION_APPLIED','EMAIL_OPERATION_UNCERTAIN','EMAIL_OPERATION_REJECTED','EMAIL_OPERATION_COMPLETED'))
    OR (resource_type='EMAIL_CHANGE' AND action IN ('EMAIL_CHANGE_REQUESTED','EMAIL_ADDRESS_VERIFIED','EMAIL_CHANGE_CANCELLED'))
    OR (resource_type='EXTERNAL_IDENTITY' AND action IN ('EXTERNAL_IDENTITY_LINKED','EXTERNAL_IDENTITY_UNLINKED'))
    OR (resource_type='RECOVERY_CASE' AND action IN ('RECOVERY_CREATED','RECOVERY_READ','RECOVERY_APPROVED','RECOVERY_REJECTED','RECOVERY_ACCEPTED','RECOVERY_COMPLETED'))
    OR (resource_type='SETUP' AND (actor_type='PLATFORM_ADMIN' OR (actor_type='BUSINESS' AND organization_id IS NOT NULL)) AND action IN ('SETUP_INVITED','SETUP_REVOKED','SETUP_RESENT','SETUP_PREPARED','SETUP_APPLIED','SETUP_UNCERTAIN','SETUP_REJECTED','SETUP_COMPLETED','SETUP_BLOCKED'))
 OR (resource_type='RELATIONSHIP' AND action IN ('TRADING_CONNECTED','TRADING_RECONNECTED','TRADING_ADMIN_CONNECTED','TRADING_DISCONNECTED','AGREED_PRICES_REVIEWED') AND actor_type IN ('BUSINESS','PLATFORM_ADMIN'))
 OR (resource_type='VENDOR_PLAN' AND action='PLAN_ASSIGNED' AND actor_type='PLATFORM_ADMIN')
 OR (resource_type='PLAN_REQUEST' AND action IN ('PLAN_REQUESTED','PLAN_WITHDRAWN','PLAN_APPROVED','PLAN_REJECTED','PLAN_SUPERSEDED'))
 OR (resource_type IN ('CATEGORY','TAG','UNIT') AND action IN ('TAXONOMY_CREATED','TAXONOMY_RENAMED','TAXONOMY_DELETED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PRODUCT' AND action IN ('PRODUCT_CREATED','PRODUCT_UPDATED','PRODUCT_ARCHIVED','PRODUCT_RESTORED','PRODUCT_ACTIVATED','PRODUCT_DEACTIVATED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PRODUCT_PRICING' AND action='PRICING_UPDATED' AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='AGREED_PRICE' AND action IN ('AGREED_PRICE_SAVED','AGREED_PRICE_REMOVED','AGREED_PRICE_CONFIRMED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PROMOTION' AND action IN ('PROMOTION_CREATED','PROMOTION_UPDATED','PROMOTION_STOPPED','PROMOTION_ARCHIVED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='STOCK' AND action IN ('STOCK_INITIALIZED','STOCK_SET','STOCK_ADJUSTED','STOCK_CONFIRMED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='TRACKING' AND action IN ('TRACKING_ENABLED','TRACKING_DISABLED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL AND resource_id=organization_id)
 OR (resource_type='RECONCILIATION' AND action IN ('RECONCILIATION_PREPARED','RECONCILIATION_ACKNOWLEDGED','RECONCILIATION_APPLIED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='ORDER' AND action IN ('ORDER_DISPATCHED','ORDER_DELIVERED','ORDER_SUBMITTED','ORDER_ACCEPTED','ORDER_REJECTED','ORDER_CANCELLED','ORDER_STAGE_CHANGED','CANCELLATION_REQUESTED','CANCELLATION_APPROVED','CANCELLATION_REJECTED','CANCELLATION_WITHDRAWN','CANCELLATION_RESOLVED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)

 OR(resource_type='ORDER_MESSAGE' AND action='MESSAGE_CREATED' AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR(resource_type='ORDER_STAGE' AND action IN ('STAGE_CREATED','STAGE_RENAMED','STAGE_RETIRED','STAGES_REORDERED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=43 WHERE id=1;
