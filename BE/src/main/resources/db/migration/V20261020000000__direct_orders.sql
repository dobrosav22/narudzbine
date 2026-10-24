CREATE TABLE order_number_counter(vendor_id uuid NOT NULL REFERENCES organization(id),local_year integer NOT NULL CHECK(local_year BETWEEN 2000 AND 9999),last_number bigint NOT NULL CHECK(last_number>0),PRIMARY KEY(vendor_id,local_year));
CREATE FUNCTION guard_order_number() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Order numbers retained';END IF;
 PERFORM id FROM organization WHERE id=NEW.vendor_id AND type='VENDOR' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Vendor required';END IF;
 IF TG_OP='UPDATE' AND (NEW.vendor_id<>OLD.vendor_id OR NEW.local_year<>OLD.local_year OR NEW.last_number<>OLD.last_number+1) THEN RAISE EXCEPTION 'Order sequence monotonic';END IF;RETURN NEW;
END $$;
CREATE TRIGGER tr_order_number BEFORE INSERT OR UPDATE OR DELETE ON order_number_counter FOR EACH ROW EXECUTE FUNCTION guard_order_number();
CREATE TABLE purchase_order(
 id uuid PRIMARY KEY,buyer_id uuid NOT NULL REFERENCES organization(id),vendor_id uuid NOT NULL REFERENCES organization(id),country varchar(2) NOT NULL CHECK(country IN ('RS','BA')),
 local_year integer NOT NULL,sequence_number bigint NOT NULL CHECK(sequence_number>0),review_id uuid NOT NULL,submitted_by uuid NOT NULL REFERENCES account_identity(id),
 state varchar(30) NOT NULL CHECK(state='AWAITING_ACCEPTANCE'),revision bigint NOT NULL CHECK(revision=1),snapshot jsonb NOT NULL,submitted_at timestamptz(3) NOT NULL,
 UNIQUE(vendor_id,local_year,sequence_number),UNIQUE(id,vendor_id),CHECK(buyer_id<>vendor_id),FOREIGN KEY(vendor_id,local_year) REFERENCES order_number_counter(vendor_id,local_year)
);
CREATE INDEX ix_order_buyer ON purchase_order(buyer_id,submitted_at DESC,id);
CREATE INDEX ix_order_vendor ON purchase_order(vendor_id,submitted_at DESC,id);
CREATE FUNCTION guard_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Submitted order snapshot immutable';END IF;
 IF NOT EXISTS(SELECT 1 FROM organization b JOIN organization v ON v.id=NEW.vendor_id JOIN business_account a ON a.id=NEW.submitted_by AND a.organization_id=b.id
 JOIN order_review r ON r.id=NEW.review_id AND r.buyer_id=b.id AND r.vendor_id=v.id AND r.draft_id IS NULL AND r.expires_at>NEW.submitted_at
 JOIN trading_relationship t ON t.id=r.relationship_id AND t.connection_generation=r.relationship_generation AND t.state='ACTIVE'
 WHERE b.id=NEW.buyer_id AND b.type='BUYER' AND v.type='VENDOR' AND b.country=v.country AND b.country=NEW.country AND b.state='ACTIVE' AND v.state='ACTIVE') THEN RAISE EXCEPTION 'Invalid order scope/review';END IF;
 IF NEW.local_year<>extract(year FROM NEW.submitted_at AT TIME ZONE CASE WHEN NEW.country='RS' THEN 'Europe/Belgrade' ELSE 'Europe/Sarajevo' END)::integer THEN RAISE EXCEPTION 'Invalid order year';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_order BEFORE INSERT OR UPDATE OR DELETE ON purchase_order FOR EACH ROW EXECUTE FUNCTION guard_order();
CREATE TABLE purchase_order_line(order_id uuid NOT NULL,product_id uuid NOT NULL REFERENCES catalogue_product(id),vendor_id uuid NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000000),snapshot jsonb NOT NULL,PRIMARY KEY(order_id,product_id),FOREIGN KEY(order_id,vendor_id) REFERENCES purchase_order(id,vendor_id));
CREATE TABLE purchase_order_event(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES purchase_order(id),buyer_id uuid NOT NULL REFERENCES organization(id),vendor_id uuid NOT NULL REFERENCES organization(id),actor_id uuid NOT NULL REFERENCES account_identity(id),actor_display_name varchar(200) NOT NULL,state varchar(30) NOT NULL CHECK(state='AWAITING_ACCEPTANCE'),created_at timestamptz(3) NOT NULL,UNIQUE(order_id));
CREATE TABLE order_stock_obligation(order_id uuid NOT NULL,product_id uuid NOT NULL,vendor_id uuid NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000000),deducted boolean NOT NULL,created_at timestamptz(3) NOT NULL,PRIMARY KEY(order_id,product_id),FOREIGN KEY(order_id,product_id) REFERENCES purchase_order_line(order_id,product_id),FOREIGN KEY(order_id,vendor_id) REFERENCES purchase_order(id,vendor_id));
CREATE INDEX ix_order_stock_credit ON order_stock_obligation(vendor_id,product_id) WHERE deducted;
CREATE TABLE order_submission_replay(actor_id uuid NOT NULL REFERENCES account_identity(id),buyer_id uuid NOT NULL REFERENCES organization(id),vendor_id uuid NOT NULL REFERENCES organization(id),identity_hash bytea NOT NULL CHECK(octet_length(identity_hash)=32),review_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES purchase_order(id),payload_hash bytea NOT NULL CHECK(octet_length(payload_hash)=32),original_result jsonb,expires_at timestamptz(3) NOT NULL,PRIMARY KEY(actor_id,buyer_id,identity_hash),UNIQUE(order_id));
CREATE INDEX ix_order_submission_replay_expiry ON order_submission_replay(expires_at) WHERE original_result IS NOT NULL;
CREATE TRIGGER tr_order_replay BEFORE UPDATE OR DELETE ON order_submission_replay FOR EACH ROW EXECUTE FUNCTION protect_stock_replay();
CREATE TABLE order_notice(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES purchase_order(id),organization_id uuid NOT NULL REFERENCES organization(id),recipient_account_id uuid NOT NULL REFERENCES business_account(id),locale varchar(20) NOT NULL CHECK(locale IN ('en','sr-Latn-RS','bs-Latn-BA')),created_at timestamptz(3) NOT NULL,UNIQUE(order_id,recipient_account_id));
CREATE TABLE order_delivery(id uuid PRIMARY KEY,notice_id uuid NOT NULL REFERENCES order_notice(id),channel varchar(10) NOT NULL CHECK(channel IN ('IN_APP','EMAIL','PUSH')),state varchar(20) NOT NULL CHECK(state='QUEUED'),created_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL CHECK(expires_at=created_at+interval '24 hours'),UNIQUE(notice_id,channel));
CREATE INDEX ix_order_delivery_queue ON order_delivery(state,created_at,id);
CREATE FUNCTION guard_order_dependents() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;BEGIN
 IF TG_TABLE_NAME='order_notice' THEN
  IF NOT EXISTS(SELECT 1 FROM purchase_order o JOIN business_account a ON a.id=NEW.recipient_account_id AND a.organization_id=o.vendor_id WHERE o.id=NEW.order_id AND o.vendor_id=NEW.organization_id) THEN RAISE EXCEPTION 'Invalid order notice recipient';END IF;
 ELSIF TG_TABLE_NAME='purchase_order_line' THEN
  IF NOT EXISTS(SELECT 1 FROM catalogue_product_identity p JOIN catalogue_product d ON d.id=p.id WHERE p.id=NEW.product_id AND p.vendor_id=NEW.vendor_id AND p.active AND d.unit_pack_frozen) THEN RAISE EXCEPTION 'Invalid order line';END IF;
 ELSIF TG_TABLE_NAME='order_stock_obligation' THEN
  IF NOT EXISTS(SELECT 1 FROM purchase_order_line l WHERE l.order_id=NEW.order_id AND l.product_id=NEW.product_id AND l.vendor_id=NEW.vendor_id AND l.quantity=NEW.quantity) THEN RAISE EXCEPTION 'Invalid stock obligation';END IF;
 ELSIF TG_TABLE_NAME='purchase_order_event' THEN
  IF NOT EXISTS(SELECT 1 FROM purchase_order o WHERE o.id=NEW.order_id AND o.buyer_id=NEW.buyer_id AND o.vendor_id=NEW.vendor_id AND o.submitted_by=NEW.actor_id AND o.submitted_at=NEW.created_at) THEN RAISE EXCEPTION 'Invalid initial order event';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM purchase_order o WHERE o.id=NEW.order_id AND o.buyer_id=NEW.buyer_id AND o.vendor_id=NEW.vendor_id AND o.submitted_by=NEW.actor_id AND o.review_id=NEW.review_id AND NEW.expires_at=o.submitted_at+interval '604800 seconds') THEN RAISE EXCEPTION 'Invalid order replay';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER tr_order_line_scope BEFORE INSERT ON purchase_order_line FOR EACH ROW EXECUTE FUNCTION guard_order_dependents();
CREATE TRIGGER tr_order_event_scope BEFORE INSERT ON purchase_order_event FOR EACH ROW EXECUTE FUNCTION guard_order_dependents();
CREATE TRIGGER tr_order_obligation_scope BEFORE INSERT ON order_stock_obligation FOR EACH ROW EXECUTE FUNCTION guard_order_dependents();
CREATE TRIGGER tr_order_notice_scope BEFORE INSERT ON order_notice FOR EACH ROW EXECUTE FUNCTION guard_order_dependents();
CREATE TRIGGER tr_order_replay_scope BEFORE INSERT ON order_submission_replay FOR EACH ROW EXECUTE FUNCTION guard_order_dependents();
CREATE TRIGGER tr_order_line_immutable BEFORE UPDATE OR DELETE ON purchase_order_line FOR EACH ROW EXECUTE FUNCTION protect_pricing_history();
CREATE TRIGGER tr_order_event_immutable BEFORE UPDATE OR DELETE ON purchase_order_event FOR EACH ROW EXECUTE FUNCTION protect_pricing_history();
CREATE TRIGGER tr_order_obligation_immutable BEFORE UPDATE OR DELETE ON order_stock_obligation FOR EACH ROW EXECUTE FUNCTION protect_pricing_history();
CREATE TRIGGER tr_order_notice_immutable BEFORE UPDATE OR DELETE ON order_notice FOR EACH ROW EXECUTE FUNCTION protect_pricing_history();
CREATE FUNCTION validate_complete_order() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE line_count integer;BEGIN
 SELECT count(*) INTO line_count FROM purchase_order_line WHERE order_id=NEW.id;
 IF line_count NOT BETWEEN 1 AND 500 OR line_count<>(SELECT count(*) FROM order_stock_obligation WHERE order_id=NEW.id) OR NOT EXISTS(SELECT 1 FROM purchase_order_event WHERE order_id=NEW.id) OR NOT EXISTS(SELECT 1 FROM order_submission_replay WHERE order_id=NEW.id) THEN RAISE EXCEPTION 'Order transaction incomplete';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ct_complete_order AFTER INSERT ON purchase_order DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_complete_order();
ALTER TABLE stock_event DROP CONSTRAINT stock_event_type_check;
ALTER TABLE stock_event DROP CONSTRAINT stock_event_order_id_check;
-- Keep the numeric delta/quantity checks; extend only the event transition set.
ALTER TABLE stock_event DROP CONSTRAINT stock_event_check1;
ALTER TABLE stock_event ADD CONSTRAINT stock_event_type_check CHECK(type IN ('INITIALIZED','SET','ADJUSTED','CONFIRMED','ORDER_DEDUCTED'));
ALTER TABLE stock_event ADD CONSTRAINT ck_stock_order CHECK((type='ORDER_DEDUCTED')=(order_id IS NOT NULL));
ALTER TABLE stock_event ADD CONSTRAINT fk_stock_order FOREIGN KEY(order_id) REFERENCES purchase_order(id);
ALTER TABLE stock_event ADD CONSTRAINT ck_stock_transition CHECK((type='INITIALIZED' AND before_count IS NULL) OR (type IN ('SET','ADJUSTED') AND before_count IS NOT NULL AND before_count<>after_count) OR (type='CONFIRMED' AND before_count IS NOT NULL AND before_count=after_count) OR (type='ORDER_DEDUCTED' AND before_count IS NOT NULL AND delta<0));
CREATE OR REPLACE FUNCTION guard_stock_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM stock_balance WHERE product_id=NEW.product_id AND vendor_id=NEW.vendor_id) THEN RAISE EXCEPTION 'Invalid stock scope';END IF;
 IF NEW.type='ORDER_DEDUCTED' THEN
  IF NOT EXISTS(SELECT 1 FROM purchase_order o JOIN order_stock_obligation l ON l.order_id=o.id AND l.product_id=NEW.product_id AND l.vendor_id=o.vendor_id AND l.deducted AND l.quantity=-NEW.delta WHERE o.id=NEW.order_id AND o.vendor_id=NEW.vendor_id AND o.submitted_by=NEW.actor_id) THEN RAISE EXCEPTION 'Invalid order stock event';END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM business_account WHERE id=NEW.actor_id AND organization_id=NEW.vendor_id) THEN RAISE EXCEPTION 'Invalid stock actor';END IF;RETURN NEW;
END $$;
CREATE UNIQUE INDEX ux_order_stock_event ON stock_event(order_id,product_id) WHERE type='ORDER_DEDUCTED';
CREATE OR REPLACE FUNCTION validate_complete_order() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE line_count integer;BEGIN
 SELECT count(*) INTO line_count FROM purchase_order_line WHERE order_id=NEW.id;
 IF line_count NOT BETWEEN 1 AND 500 OR line_count<>(SELECT count(*) FROM order_stock_obligation WHERE order_id=NEW.id) OR NOT EXISTS(SELECT 1 FROM purchase_order_event WHERE order_id=NEW.id) OR NOT EXISTS(SELECT 1 FROM order_submission_replay WHERE order_id=NEW.id) OR EXISTS(SELECT 1 FROM order_stock_obligation l WHERE l.order_id=NEW.id AND l.deducted<>EXISTS(SELECT 1 FROM stock_event e WHERE e.order_id=l.order_id AND e.product_id=l.product_id AND e.type='ORDER_DEDUCTED' AND e.delta=-l.quantity)) THEN RAISE EXCEPTION 'Order transaction incomplete';END IF;RETURN NULL;
END $$;
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
 OR (resource_type='ORDER' AND action='ORDER_SUBMITTED' AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=35 WHERE id=1;
