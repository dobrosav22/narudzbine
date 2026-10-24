-- Submission headers/snapshots and original success receipts stay immutable.
ALTER TABLE purchase_order_event DROP CONSTRAINT purchase_order_event_order_id_key;
ALTER TABLE purchase_order_event DROP CONSTRAINT purchase_order_event_state_check;
ALTER TABLE purchase_order_event ADD COLUMN revision bigint NOT NULL DEFAULT 1,
 ADD COLUMN previous_state varchar(30),ADD COLUMN reason varchar(1000),
 ADD COLUMN actor_organization_id uuid REFERENCES organization(id),ADD COLUMN result jsonb;
ALTER TABLE purchase_order_event ADD CONSTRAINT ux_order_event_revision UNIQUE(order_id,revision);
ALTER TABLE purchase_order_event ADD CONSTRAINT ck_order_event_response CHECK(
 (revision=1 AND state='AWAITING_ACCEPTANCE' AND previous_state IS NULL AND reason IS NULL AND actor_organization_id IS NULL AND result IS NULL)
 OR (revision=2 AND previous_state IS NOT NULL AND previous_state='AWAITING_ACCEPTANCE' AND actor_organization_id IS NOT NULL AND actor_organization_id=vendor_id AND result IS NOT NULL AND jsonb_typeof(result)='object'
 AND ((state='ACCEPTED' AND reason IS NULL) OR (state='REJECTED' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000))));
CREATE TABLE order_response(
 order_id uuid NOT NULL REFERENCES purchase_order(id),from_revision bigint NOT NULL CHECK(from_revision=1),
 vendor_id uuid NOT NULL REFERENCES organization(id),buyer_id uuid NOT NULL REFERENCES organization(id),
 action varchar(20) NOT NULL CHECK(action IN ('ACCEPTED','REJECTED')),expected_revision varchar(256) NOT NULL CHECK(length(expected_revision)>0),
 fulfillment_location_id uuid REFERENCES organization_location(id),reason varchar(1000),actor_id uuid NOT NULL REFERENCES account_identity(id),
 event_id uuid NOT NULL UNIQUE REFERENCES purchase_order_event(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz(3) NOT NULL,
 PRIMARY KEY(order_id,from_revision),UNIQUE(order_id,expected_revision),
 CHECK((action='ACCEPTED' AND reason IS NULL) OR(action='REJECTED' AND fulfillment_location_id IS NULL AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000))
);
CREATE TRIGGER tr_order_response_immutable BEFORE UPDATE OR DELETE ON order_response FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_order_response() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM purchase_order o JOIN business_account a ON a.id=NEW.actor_id AND a.organization_id=o.vendor_id JOIN account_identity i ON i.id=a.id JOIN organization v ON v.id=o.vendor_id
 WHERE o.id=NEW.order_id AND o.vendor_id=NEW.vendor_id AND o.buyer_id=NEW.buyer_id AND o.state='AWAITING_ACCEPTANCE' AND o.revision=NEW.from_revision AND NEW.created_at>=o.submitted_at AND i.state='ACTIVE' AND v.state='ACTIVE') THEN RAISE EXCEPTION 'Invalid vendor response source';END IF;
 IF NEW.fulfillment_location_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organization_location l JOIN organization v ON v.id=NEW.vendor_id WHERE l.id=NEW.fulfillment_location_id AND l.organization_id=v.id AND l.state='ACTIVE' AND l.country=v.country) THEN RAISE EXCEPTION 'Invalid fulfillment source';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER tr_order_response_scope BEFORE INSERT ON order_response FOR EACH ROW EXECUTE FUNCTION guard_order_response();
DROP TRIGGER tr_order_event_scope ON purchase_order_event;
CREATE FUNCTION guard_order_response_event() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE o purchase_order%ROWTYPE;r order_response%ROWTYPE;frozen text;BEGIN
 SELECT * INTO o FROM purchase_order WHERE id=NEW.order_id;
 IF o.id IS NULL OR NEW.buyer_id<>o.buyer_id OR NEW.vendor_id<>o.vendor_id THEN RAISE EXCEPTION 'Invalid event parties';END IF;
 IF NEW.revision=1 THEN
  IF NEW.actor_id<>o.submitted_by OR NEW.created_at<>o.submitted_at THEN RAISE EXCEPTION 'Invalid initial event';END IF;
 ELSE
  SELECT * INTO r FROM order_response WHERE event_id=NEW.id;
  IF r.order_id IS DISTINCT FROM NEW.order_id OR r.actor_id IS DISTINCT FROM NEW.actor_id OR r.action IS DISTINCT FROM NEW.state OR r.reason IS DISTINCT FROM NEW.reason OR r.created_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'Invalid response event';END IF;
  IF (NEW.result->>'revision')::bigint IS DISTINCT FROM NEW.revision OR NEW.result->>'state' IS DISTINCT FROM NEW.state OR (NEW.result->>'updatedAt')::timestamptz IS DISTINCT FROM NEW.created_at OR NEW.result->>'originalRevision' IS NULL THEN RAISE EXCEPTION 'Invalid response snapshot';END IF;
  FOREACH frozen IN ARRAY ARRAY['id','number','vendor','buyer','terms','submittedByAccountId','submittedByDisplayName','submittedAt'] LOOP
   IF NEW.result->frozen IS DISTINCT FROM o.snapshot->frozen THEN RAISE EXCEPTION 'Commercial snapshot immutable';END IF;
  END LOOP;
  IF r.fulfillment_location_id IS NULL THEN
   IF NEW.result->'fulfillment' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unexpected fulfillment';END IF;
  ELSE
   IF (NEW.result#>>'{fulfillment,location,id}')::uuid IS DISTINCT FROM r.fulfillment_location_id OR NEW.result#>>'{fulfillment,revision}' IS NULL THEN RAISE EXCEPTION 'Invalid frozen fulfillment';END IF;
  END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_order_event_scope BEFORE INSERT ON purchase_order_event FOR EACH ROW EXECUTE FUNCTION guard_order_response_event();
CREATE TABLE order_stock_credit(
 order_id uuid NOT NULL,product_id uuid NOT NULL,vendor_id uuid NOT NULL,quantity integer NOT NULL CHECK(quantity>0),
 actor_id uuid NOT NULL REFERENCES account_identity(id),created_at timestamptz(3) NOT NULL,
 before_count integer NOT NULL,after_count integer NOT NULL CHECK(after_count BETWEEN 0 AND 1000000000),
 before_credit bigint NOT NULL,after_credit bigint NOT NULL CHECK(after_credit BETWEEN 0 AND 1000000000),before_revision bigint NOT NULL,confirmed_epoch bigint NOT NULL,
 PRIMARY KEY(order_id,product_id),FOREIGN KEY(order_id,product_id) REFERENCES order_stock_obligation(order_id,product_id),
 FOREIGN KEY(order_id,vendor_id) REFERENCES purchase_order(id,vendor_id),CHECK(after_count=before_count+quantity),CHECK(after_credit=before_credit-quantity)
);
CREATE TRIGGER tr_order_credit_immutable BEFORE UPDATE OR DELETE ON order_stock_credit FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_order_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM order_stock_obligation l JOIN order_response r ON r.order_id=l.order_id AND r.action='REJECTED'
 JOIN stock_balance b ON b.product_id=l.product_id AND b.vendor_id=l.vendor_id
 WHERE l.order_id=NEW.order_id AND l.product_id=NEW.product_id AND l.vendor_id=NEW.vendor_id AND l.deducted AND l.quantity=NEW.quantity AND r.actor_id=NEW.actor_id AND r.created_at=NEW.created_at
 AND b.available_count=NEW.before_count AND b.credit_quantity=NEW.before_credit AND b.revision=NEW.before_revision AND b.confirmed_epoch=NEW.confirmed_epoch) THEN RAISE EXCEPTION 'Invalid original credit';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER tr_order_credit_scope BEFORE INSERT ON order_stock_credit FOR EACH ROW EXECUTE FUNCTION guard_order_credit();
ALTER TABLE stock_event DROP CONSTRAINT stock_event_type_check;
ALTER TABLE stock_event DROP CONSTRAINT ck_stock_order;
ALTER TABLE stock_event DROP CONSTRAINT ck_stock_transition;
ALTER TABLE stock_event ADD CONSTRAINT stock_event_type_check CHECK(type IN ('INITIALIZED','SET','ADJUSTED','CONFIRMED','ORDER_DEDUCTED','ORDER_CREDITED'));
ALTER TABLE stock_event ADD CONSTRAINT ck_stock_order CHECK((type IN ('ORDER_DEDUCTED','ORDER_CREDITED'))=(order_id IS NOT NULL));
ALTER TABLE stock_event ADD CONSTRAINT ck_stock_transition CHECK((type='INITIALIZED' AND before_count IS NULL) OR(type IN ('SET','ADJUSTED') AND before_count IS NOT NULL AND before_count<>after_count) OR(type='CONFIRMED' AND before_count IS NOT NULL AND before_count=after_count) OR(type='ORDER_DEDUCTED' AND before_count IS NOT NULL AND delta<0) OR(type='ORDER_CREDITED' AND before_count IS NOT NULL AND delta>0));
CREATE OR REPLACE FUNCTION guard_stock_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM stock_balance WHERE product_id=NEW.product_id AND vendor_id=NEW.vendor_id) THEN RAISE EXCEPTION 'Invalid stock scope';END IF;
 IF NEW.type='ORDER_DEDUCTED' THEN
  IF NOT EXISTS(SELECT 1 FROM purchase_order o JOIN order_stock_obligation l ON l.order_id=o.id AND l.product_id=NEW.product_id AND l.vendor_id=o.vendor_id AND l.deducted AND l.quantity=-NEW.delta WHERE o.id=NEW.order_id AND o.vendor_id=NEW.vendor_id AND o.submitted_by=NEW.actor_id) THEN RAISE EXCEPTION 'Invalid order stock event';END IF;
 ELSIF NEW.type='ORDER_CREDITED' THEN
  IF NOT EXISTS(SELECT 1 FROM order_stock_credit c WHERE c.order_id=NEW.order_id AND c.product_id=NEW.product_id AND c.vendor_id=NEW.vendor_id AND c.quantity=NEW.delta AND c.actor_id=NEW.actor_id AND c.created_at=NEW.created_at AND c.before_count=NEW.before_count AND c.after_count=NEW.after_count) THEN RAISE EXCEPTION 'Invalid restoration event';END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM business_account WHERE id=NEW.actor_id AND organization_id=NEW.vendor_id) THEN RAISE EXCEPTION 'Invalid stock actor';END IF;RETURN NEW;END $$;
CREATE UNIQUE INDEX ux_order_stock_restored ON stock_event(order_id,product_id) WHERE type='ORDER_CREDITED';
ALTER TABLE order_notice DROP CONSTRAINT order_notice_order_id_recipient_account_id_key;
ALTER TABLE order_notice ADD COLUMN event_id uuid REFERENCES purchase_order_event(id);
ALTER TABLE order_notice ADD CONSTRAINT ux_order_notice_event UNIQUE NULLS NOT DISTINCT(order_id,event_id,recipient_account_id);
DROP TRIGGER tr_order_notice_scope ON order_notice;
CREATE FUNCTION guard_order_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.event_id IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM purchase_order o JOIN business_account a ON a.id=NEW.recipient_account_id AND a.organization_id=o.vendor_id WHERE o.id=NEW.order_id AND o.vendor_id=NEW.organization_id) THEN RAISE EXCEPTION 'Invalid initial notice';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM purchase_order o JOIN purchase_order_event e ON e.id=NEW.event_id AND e.order_id=o.id AND e.revision=2 JOIN business_account a ON a.id=NEW.recipient_account_id AND a.organization_id=o.buyer_id WHERE o.id=NEW.order_id AND NEW.organization_id=o.buyer_id AND (a.id=o.submitted_by OR a.role IN ('OWNER','ADMIN')) AND NEW.created_at=e.created_at) THEN RAISE EXCEPTION 'Invalid status notice';END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_order_notice_scope BEFORE INSERT ON order_notice FOR EACH ROW EXECUTE FUNCTION guard_order_notice();
CREATE FUNCTION validate_order_response_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM purchase_order_event e WHERE e.id=NEW.event_id AND e.order_id=NEW.order_id AND e.revision=2 AND e.state=NEW.action AND e.result IS NOT NULL) THEN RAISE EXCEPTION 'Response event missing';END IF;
 IF NEW.action='ACCEPTED' THEN
  IF EXISTS(SELECT 1 FROM order_stock_credit WHERE order_id=NEW.order_id) THEN RAISE EXCEPTION 'Acceptance cannot restore stock';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM order_stock_obligation l WHERE l.order_id=NEW.order_id AND l.deducted<>EXISTS(SELECT 1 FROM order_stock_credit c JOIN stock_event e ON e.order_id=c.order_id AND e.product_id=c.product_id AND e.type='ORDER_CREDITED' AND e.delta=c.quantity WHERE c.order_id=l.order_id AND c.product_id=l.product_id)) THEN RAISE EXCEPTION 'Incomplete original credit';END IF;
  IF EXISTS(SELECT 1 FROM order_stock_credit c JOIN stock_balance b ON b.product_id=c.product_id WHERE c.order_id=NEW.order_id AND (b.available_count<>c.after_count OR b.credit_quantity<>c.after_credit OR b.revision<>c.before_revision+1 OR b.confirmed_epoch<>c.confirmed_epoch)) THEN RAISE EXCEPTION 'Credit balance mismatch';END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id JOIN purchase_order p ON p.id=NEW.order_id WHERE b.organization_id=NEW.buyer_id AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND(a.id=p.submitted_by OR b.role IN ('OWNER','ADMIN')) AND NOT EXISTS(SELECT 1 FROM order_notice n WHERE n.order_id=NEW.order_id AND n.event_id=NEW.event_id AND n.recipient_account_id=a.id AND (SELECT count(*) FROM order_delivery d WHERE d.notice_id=n.id)=3)) THEN RAISE EXCEPTION 'Response delivery intent missing';END IF;
 RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_order_response_complete AFTER INSERT ON order_response DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_order_response_complete();
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
 OR (resource_type='ORDER' AND action IN ('ORDER_SUBMITTED','ORDER_ACCEPTED','ORDER_REJECTED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=38 WHERE id=1;
