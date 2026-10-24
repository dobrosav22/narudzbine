-- Real request lifecycle records; original submission and response JSON remain untouched.
CREATE TABLE cancellation_request(
 id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES purchase_order(id),buyer_id uuid NOT NULL REFERENCES organization(id),vendor_id uuid NOT NULL REFERENCES organization(id),
 order_from_revision bigint NOT NULL CHECK(order_from_revision>=2),expected_order_revision varchar(256) NOT NULL CHECK(length(expected_order_revision)>0),reason varchar(1000) NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
 actor_id uuid NOT NULL REFERENCES account_identity(id),event_id uuid NOT NULL UNIQUE REFERENCES purchase_order_event(id) DEFERRABLE INITIALLY DEFERRED,created_at timestamptz(3) NOT NULL,original_result jsonb NOT NULL,
 UNIQUE(order_id,expected_order_revision),UNIQUE(order_id,id)
);
CREATE TABLE cancellation_resolution(
 request_id uuid PRIMARY KEY REFERENCES cancellation_request(id),organization_id uuid NOT NULL REFERENCES organization(id),action varchar(20) NOT NULL CHECK(action IN ('APPROVED','REJECTED','WITHDRAWN','RESOLVED')),
 expected_request_revision varchar(256) NOT NULL CHECK(length(expected_request_revision)>0),reason varchar(1000),actor_id uuid NOT NULL REFERENCES account_identity(id),event_id uuid NOT NULL UNIQUE REFERENCES purchase_order_event(id) DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz(3) NOT NULL,original_result jsonb NOT NULL,
 CHECK((action IN ('REJECTED','RESOLVED') AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000) OR(action IN ('WITHDRAWN','APPROVED') AND reason IS NULL))
);
CREATE TABLE order_pending_cancellation(order_id uuid PRIMARY KEY REFERENCES purchase_order(id),request_id uuid NOT NULL UNIQUE,FOREIGN KEY(order_id,request_id) REFERENCES cancellation_request(order_id,id));
CREATE TRIGGER tr_cancellation_request_immutable BEFORE UPDATE OR DELETE ON cancellation_request FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_cancellation_resolution_immutable BEFORE UPDATE OR DELETE ON cancellation_resolution FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER tr_pending_cancellation_no_update BEFORE UPDATE ON order_pending_cancellation FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_cancellation_request() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE o purchase_order%ROWTYPE;e purchase_order_event%ROWTYPE;BEGIN
 SELECT * INTO o FROM purchase_order WHERE id=NEW.order_id;SELECT * INTO e FROM purchase_order_event WHERE order_id=NEW.order_id ORDER BY revision DESC LIMIT 1;
 IF o.id IS NULL OR o.buyer_id<>NEW.buyer_id OR o.vendor_id<>NEW.vendor_id OR e.state IS DISTINCT FROM 'ACCEPTED' OR e.revision IS DISTINCT FROM NEW.order_from_revision OR NEW.created_at<e.created_at OR EXISTS(SELECT 1 FROM order_pending_cancellation WHERE order_id=NEW.order_id) THEN RAISE EXCEPTION 'Invalid cancellation request source';END IF;
 IF NOT EXISTS(SELECT 1 FROM business_account b JOIN account_identity a ON a.id=b.id JOIN organization g ON g.id=b.organization_id WHERE b.id=NEW.actor_id AND b.organization_id=NEW.buyer_id AND a.state='ACTIVE' AND a.email_verified AND g.state='ACTIVE' AND(b.role IN ('OWNER','ADMIN') OR NOT g.staff_submission_restricted)) THEN RAISE EXCEPTION 'Invalid cancellation requester';END IF;
 IF (NEW.original_result->>'id')::uuid IS DISTINCT FROM NEW.id OR(NEW.original_result->>'orderId')::uuid IS DISTINCT FROM NEW.order_id OR NEW.original_result->>'reason' IS DISTINCT FROM NEW.reason OR NEW.original_result->>'state' IS DISTINCT FROM 'PENDING' OR(NEW.original_result->>'revision')::bigint IS DISTINCT FROM 1 OR NEW.original_result->>'originalRevision' IS NULL OR NEW.original_result->'resolutionReason' IS DISTINCT FROM 'null'::jsonb OR(NEW.original_result->>'createdAt')::timestamptz IS DISTINCT FROM NEW.created_at OR(NEW.original_result->>'updatedAt')::timestamptz IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'Invalid initial request snapshot';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER tr_cancellation_request_scope BEFORE INSERT ON cancellation_request FOR EACH ROW EXECUTE FUNCTION guard_cancellation_request();
CREATE FUNCTION guard_cancellation_resolution() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE c cancellation_request%ROWTYPE;e purchase_order_event%ROWTYPE;BEGIN
 SELECT * INTO c FROM cancellation_request WHERE id=NEW.request_id;SELECT * INTO e FROM purchase_order_event WHERE order_id=c.order_id ORDER BY revision DESC LIMIT 1;
 IF c.id IS NULL OR e.state IS DISTINCT FROM 'ACCEPTED' OR NEW.created_at<e.created_at OR NOT EXISTS(SELECT 1 FROM order_pending_cancellation WHERE order_id=c.order_id AND request_id=c.id) OR NEW.organization_id IS DISTINCT FROM (CASE WHEN NEW.action='WITHDRAWN' THEN c.buyer_id ELSE c.vendor_id END) THEN RAISE EXCEPTION 'Invalid request resolution source';END IF;
 IF NOT EXISTS(SELECT 1 FROM business_account b JOIN account_identity a ON a.id=b.id JOIN organization g ON g.id=b.organization_id WHERE b.id=NEW.actor_id AND b.organization_id=NEW.organization_id AND a.state='ACTIVE' AND a.email_verified AND g.state='ACTIVE' AND(NEW.action<>'WITHDRAWN' OR b.role IN ('OWNER','ADMIN') OR NOT g.staff_submission_restricted)) THEN RAISE EXCEPTION 'Invalid request resolver';END IF;
 IF NEW.action IN ('APPROVED','RESOLVED') AND NOT EXISTS(SELECT 1 FROM order_cancellation x WHERE x.order_id=c.order_id AND x.actor_id=NEW.actor_id AND x.created_at=NEW.created_at AND x.event_id=NEW.event_id AND x.reason=CASE WHEN NEW.action='APPROVED' THEN c.reason ELSE NEW.reason END) THEN RAISE EXCEPTION 'Resolution needs actual cancellation';END IF;
 IF (NEW.original_result->>'id')::uuid IS DISTINCT FROM c.id OR(NEW.original_result->>'orderId')::uuid IS DISTINCT FROM c.order_id OR NEW.original_result->>'reason' IS DISTINCT FROM c.reason OR NEW.original_result->>'state' IS DISTINCT FROM NEW.action OR(NEW.original_result->>'revision')::bigint IS DISTINCT FROM 2 OR NEW.original_result->>'originalRevision' IS NULL OR NEW.original_result->>'resolutionReason' IS DISTINCT FROM NEW.reason OR(NEW.original_result->>'createdAt')::timestamptz IS DISTINCT FROM c.created_at OR(NEW.original_result->>'updatedAt')::timestamptz IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'Invalid resolved request snapshot';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER tr_cancellation_resolution_scope BEFORE INSERT ON cancellation_resolution FOR EACH ROW EXECUTE FUNCTION guard_cancellation_resolution();
ALTER TABLE order_cancellation DROP CONSTRAINT order_cancellation_from_revision_check;
ALTER TABLE order_cancellation ADD CONSTRAINT order_cancellation_from_revision_check CHECK(from_revision>=1);
ALTER TABLE purchase_order_event ADD COLUMN cancellation_request_id uuid REFERENCES cancellation_request(id),ADD COLUMN cancellation_request_state varchar(20);
ALTER TABLE purchase_order_event DROP CONSTRAINT ck_order_event_response;
ALTER TABLE purchase_order_event ADD CONSTRAINT ck_order_event_response CHECK(
 (revision=1 AND state='AWAITING_ACCEPTANCE' AND previous_state IS NULL AND reason IS NULL AND actor_organization_id IS NULL AND result IS NULL AND cancellation_request_id IS NULL AND cancellation_request_state IS NULL)
 OR(revision=2 AND previous_state IS NOT NULL AND previous_state='AWAITING_ACCEPTANCE' AND actor_organization_id IS NOT NULL AND actor_organization_id=vendor_id AND result IS NOT NULL AND jsonb_typeof(result)='object' AND cancellation_request_id IS NULL AND cancellation_request_state IS NULL AND((state='ACCEPTED' AND reason IS NULL) OR(state='REJECTED' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000)))
 OR(state='CANCELLED' AND revision>=2 AND previous_state IS NOT NULL AND previous_state IN ('AWAITING_ACCEPTANCE','ACCEPTED') AND actor_organization_id IS NOT NULL AND actor_organization_id IN (buyer_id,vendor_id) AND result IS NOT NULL AND jsonb_typeof(result)='object' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000 AND((cancellation_request_id IS NULL AND cancellation_request_state IS NULL) OR(cancellation_request_id IS NOT NULL AND cancellation_request_state IS NOT NULL AND cancellation_request_state IN ('APPROVED','RESOLVED'))))
 OR(state='ACCEPTED' AND revision>=3 AND previous_state IS NOT NULL AND previous_state='ACCEPTED' AND actor_organization_id IS NOT NULL AND actor_organization_id IN (buyer_id,vendor_id) AND result IS NOT NULL AND jsonb_typeof(result)='object' AND cancellation_request_id IS NOT NULL AND cancellation_request_state IS NOT NULL AND((cancellation_request_state IN ('PENDING','REJECTED') AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000) OR(cancellation_request_state='WITHDRAWN' AND reason IS NULL))));
CREATE OR REPLACE FUNCTION guard_order_response_event() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE o purchase_order%ROWTYPE;r order_response%ROWTYPE;c order_cancellation%ROWTYPE;frozen text;source jsonb;q cancellation_request%ROWTYPE;z cancellation_resolution%ROWTYPE;BEGIN
 IF NEW.state='DISPATCHED' AND EXISTS(SELECT 1 FROM order_pending_cancellation WHERE order_id=NEW.order_id) THEN RAISE EXCEPTION 'Pending cancellation blocks dispatch';END IF;
 SELECT * INTO o FROM purchase_order WHERE id=NEW.order_id;
 IF o.id IS NULL OR NEW.buyer_id<>o.buyer_id OR NEW.vendor_id<>o.vendor_id THEN RAISE EXCEPTION 'Invalid event parties';END IF;
 IF NEW.revision=1 THEN
  IF NEW.actor_id<>o.submitted_by OR NEW.created_at<>o.submitted_at THEN RAISE EXCEPTION 'Invalid initial event';END IF;RETURN NEW;
 END IF;
 source:=o.snapshot;
 IF NEW.state='CANCELLED' THEN
  SELECT * INTO c FROM order_cancellation WHERE event_id=NEW.id;
  IF c.order_id IS DISTINCT FROM NEW.order_id OR c.actor_id IS DISTINCT FROM NEW.actor_id OR c.organization_id IS DISTINCT FROM NEW.actor_organization_id OR c.reason IS DISTINCT FROM NEW.reason OR c.created_at IS DISTINCT FROM NEW.created_at OR c.from_revision+1 IS DISTINCT FROM NEW.revision THEN RAISE EXCEPTION 'Invalid cancellation event';END IF;
  SELECT COALESCE(e.result,o.snapshot) INTO source FROM purchase_order_event e WHERE e.order_id=o.id AND e.revision=c.from_revision;
  IF source IS NULL OR source->>'state' IS DISTINCT FROM NEW.previous_state OR NEW.result->'fulfillment' IS DISTINCT FROM COALESCE(source->'fulfillment','null'::jsonb) THEN RAISE EXCEPTION 'Invalid cancellation snapshot';END IF;
 ELSIF NEW.cancellation_request_id IS NOT NULL THEN
  SELECT COALESCE(e.result,o.snapshot) INTO source FROM purchase_order_event e WHERE e.order_id=o.id AND e.revision=NEW.revision-1;
  IF source IS NULL OR source->>'state' IS DISTINCT FROM 'ACCEPTED' OR NEW.result->'fulfillment' IS DISTINCT FROM source->'fulfillment' THEN RAISE EXCEPTION 'Invalid request order source';END IF;
 ELSE
  SELECT * INTO r FROM order_response WHERE event_id=NEW.id;
  IF r.order_id IS DISTINCT FROM NEW.order_id OR r.actor_id IS DISTINCT FROM NEW.actor_id OR r.action IS DISTINCT FROM NEW.state OR r.reason IS DISTINCT FROM NEW.reason OR r.created_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'Invalid response event';END IF;
  IF r.fulfillment_location_id IS NULL THEN
   IF NEW.result->'fulfillment' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unexpected fulfillment';END IF;
  ELSE
   IF (NEW.result#>>'{fulfillment,location,id}')::uuid IS DISTINCT FROM r.fulfillment_location_id OR NEW.result#>>'{fulfillment,revision}' IS NULL THEN RAISE EXCEPTION 'Invalid frozen fulfillment';END IF;
  END IF;
 END IF;
 IF NEW.cancellation_request_id IS NOT NULL THEN
  SELECT * INTO q FROM cancellation_request WHERE id=NEW.cancellation_request_id;
  IF q.order_id IS DISTINCT FROM NEW.order_id THEN RAISE EXCEPTION 'Invalid event request';END IF;
  IF NEW.cancellation_request_state='PENDING' THEN
   IF q.event_id IS DISTINCT FROM NEW.id OR q.actor_id IS DISTINCT FROM NEW.actor_id OR q.buyer_id IS DISTINCT FROM NEW.actor_organization_id OR q.created_at IS DISTINCT FROM NEW.created_at OR q.reason IS DISTINCT FROM NEW.reason OR q.order_from_revision+1 IS DISTINCT FROM NEW.revision OR(NEW.result->>'cancellationRequestId')::uuid IS DISTINCT FROM q.id THEN RAISE EXCEPTION 'Invalid opening event';END IF;
  ELSE
   SELECT * INTO z FROM cancellation_resolution WHERE request_id=q.id;
   IF z.event_id IS DISTINCT FROM NEW.id OR z.action IS DISTINCT FROM NEW.cancellation_request_state OR z.actor_id IS DISTINCT FROM NEW.actor_id OR z.organization_id IS DISTINCT FROM NEW.actor_organization_id OR z.created_at IS DISTINCT FROM NEW.created_at OR(NEW.cancellation_request_state IN ('REJECTED','WITHDRAWN') AND z.reason IS DISTINCT FROM NEW.reason) THEN RAISE EXCEPTION 'Invalid resolution event';END IF;
   IF NEW.result->'cancellationRequestId' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Resolved pointer remains';END IF;
  END IF;
 ELSE
  IF COALESCE(NEW.result->'cancellationRequestId','null'::jsonb) IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unexpected pending request';END IF;
 END IF;
 IF (NEW.result->>'revision')::bigint IS DISTINCT FROM NEW.revision OR NEW.result->>'state' IS DISTINCT FROM NEW.state OR (NEW.result->>'updatedAt')::timestamptz IS DISTINCT FROM NEW.created_at OR NEW.result->>'originalRevision' IS NULL THEN RAISE EXCEPTION 'Invalid response snapshot';END IF;
 FOREACH frozen IN ARRAY ARRAY['id','number','vendor','buyer','terms','submittedByAccountId','submittedByDisplayName','submittedAt'] LOOP
  IF NEW.result->frozen IS DISTINCT FROM source->frozen THEN RAISE EXCEPTION 'Commercial snapshot immutable';END IF;
 END LOOP;RETURN NEW;END $$;
CREATE OR REPLACE FUNCTION guard_order_notice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.event_id IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM purchase_order o JOIN business_account a ON a.id=NEW.recipient_account_id AND a.organization_id=o.vendor_id WHERE o.id=NEW.order_id AND o.vendor_id=NEW.organization_id) THEN RAISE EXCEPTION 'Invalid initial notice';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM purchase_order o JOIN purchase_order_event e ON e.id=NEW.event_id AND e.order_id=o.id AND e.revision>=2 JOIN business_account a ON a.id=NEW.recipient_account_id AND a.organization_id=NEW.organization_id WHERE o.id=NEW.order_id AND NEW.created_at=e.created_at AND
   ((e.cancellation_request_state='PENDING' AND a.organization_id=o.vendor_id)
    OR(e.cancellation_request_state IS DISTINCT FROM 'PENDING' AND((a.organization_id=o.buyer_id AND(a.id=o.submitted_by OR a.role IN ('OWNER','ADMIN'))) OR((e.state='CANCELLED' OR e.cancellation_request_state='WITHDRAWN') AND e.actor_organization_id=o.buyer_id AND a.organization_id=o.vendor_id))))
    AND(e.state<>'CANCELLED' AND e.cancellation_request_id IS NULL OR a.id<>e.actor_id)) THEN RAISE EXCEPTION 'Invalid status notice';END IF;
 END IF;RETURN NEW;END $$;
CREATE FUNCTION validate_cancellation_request_complete() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE oid uuid;intent_event uuid;current_event purchase_order_event%ROWTYPE;BEGIN
 IF TG_TABLE_NAME='cancellation_request' THEN oid:=NEW.order_id;intent_event:=NEW.event_id;
 ELSIF TG_TABLE_NAME='cancellation_resolution' THEN SELECT order_id INTO oid FROM cancellation_request WHERE id=NEW.request_id;intent_event:=NEW.event_id;
 ELSE oid:=COALESCE(NEW.order_id,OLD.order_id);END IF;
 SELECT * INTO current_event FROM purchase_order_event WHERE order_id=oid ORDER BY revision DESC LIMIT 1;
 IF (current_event.result->>'cancellationRequestId')::uuid IS DISTINCT FROM (SELECT request_id FROM order_pending_cancellation WHERE order_id=oid) THEN RAISE EXCEPTION 'Order pending projection mismatch';END IF;
 IF EXISTS(SELECT 1 FROM cancellation_request c LEFT JOIN cancellation_resolution r ON r.request_id=c.id WHERE c.order_id=oid AND ((r.request_id IS NULL) IS DISTINCT FROM EXISTS(SELECT 1 FROM order_pending_cancellation p WHERE p.order_id=oid AND p.request_id=c.id))) THEN RAISE EXCEPTION 'Request resolution pointer mismatch';END IF;
 IF EXISTS(SELECT 1 FROM cancellation_request c WHERE c.order_id=oid AND NOT EXISTS(SELECT 1 FROM purchase_order_event e WHERE e.id=c.event_id AND e.order_id=oid AND e.cancellation_request_id=c.id AND e.cancellation_request_state='PENDING')) THEN RAISE EXCEPTION 'Opening event missing';END IF;
 IF EXISTS(SELECT 1 FROM cancellation_resolution r JOIN cancellation_request c ON c.id=r.request_id WHERE c.order_id=oid AND NOT EXISTS(SELECT 1 FROM purchase_order_event e WHERE e.id=r.event_id AND e.order_id=oid AND e.cancellation_request_id=c.id AND e.cancellation_request_state=r.action)) THEN RAISE EXCEPTION 'Resolution event missing';END IF;
 IF EXISTS(SELECT 1 FROM purchase_order_event e JOIN purchase_order o ON o.id=e.order_id JOIN business_account b ON(b.organization_id=o.buyer_id OR b.organization_id=o.vendor_id) JOIN account_identity a ON a.id=b.id JOIN organization g ON g.id=b.organization_id WHERE e.order_id=oid AND e.id=intent_event AND e.cancellation_request_id IS NOT NULL AND g.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND a.id<>e.actor_id AND
  ((e.cancellation_request_state='PENDING' AND b.organization_id=o.vendor_id) OR(e.cancellation_request_state<>'PENDING' AND((b.organization_id=o.buyer_id AND(a.id=o.submitted_by OR b.role IN ('OWNER','ADMIN'))) OR(e.cancellation_request_state='WITHDRAWN' AND b.organization_id=o.vendor_id)))) AND NOT EXISTS(SELECT 1 FROM order_notice n WHERE n.event_id=e.id AND n.order_id=oid AND n.recipient_account_id=a.id AND(SELECT count(*) FROM order_delivery d WHERE d.notice_id=n.id)=3)) THEN RAISE EXCEPTION 'Request delivery intent missing';END IF;
 RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_request_complete AFTER INSERT ON cancellation_request DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_cancellation_request_complete();
CREATE CONSTRAINT TRIGGER ct_resolution_complete AFTER INSERT ON cancellation_resolution DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_cancellation_request_complete();
CREATE CONSTRAINT TRIGGER ct_pending_complete AFTER INSERT OR DELETE ON order_pending_cancellation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_cancellation_request_complete();
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
 OR (resource_type='ORDER' AND action IN ('ORDER_SUBMITTED','ORDER_ACCEPTED','ORDER_REJECTED','ORDER_CANCELLED','CANCELLATION_REQUESTED','CANCELLATION_APPROVED','CANCELLATION_REJECTED','CANCELLATION_WITHDRAWN','CANCELLATION_RESOLVED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=40 WHERE id=1;
