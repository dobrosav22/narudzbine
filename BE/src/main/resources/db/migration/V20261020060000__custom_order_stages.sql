CREATE TABLE order_stage_configuration(vendor_id uuid PRIMARY KEY REFERENCES organization(id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1));
CREATE TABLE order_stage(id uuid PRIMARY KEY,vendor_id uuid NOT NULL REFERENCES order_stage_configuration(vendor_id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1),name varchar(100) NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),normalized_name text NOT NULL CHECK(length(normalized_name)>0),state varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','RETIRED')),position integer NOT NULL CHECK(position BETWEEN 0 AND 19),UNIQUE(vendor_id,normalized_name),UNIQUE(vendor_id,position) DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE order_stage_creation(stage_id uuid PRIMARY KEY REFERENCES order_stage(id),vendor_id uuid NOT NULL REFERENCES organization(id),creator_id uuid NOT NULL REFERENCES account_identity(id),payload_hash bytea NOT NULL CHECK(octet_length(payload_hash)=32),original_result jsonb,expires_at timestamptz(3) NOT NULL);
CREATE TABLE order_stage_mutation(vendor_id uuid NOT NULL REFERENCES organization(id),resource_id uuid NOT NULL,expected_revision varchar(256) NOT NULL,action varchar(10) NOT NULL CHECK(action IN ('RENAME','RETIRE','REORDER')),payload jsonb NOT NULL,result jsonb NOT NULL,changed boolean NOT NULL,PRIMARY KEY(vendor_id,resource_id,expected_revision,action,payload));
CREATE UNIQUE INDEX ux_stage_mutation_changed ON order_stage_mutation(vendor_id,resource_id,expected_revision) WHERE changed;
CREATE TRIGGER tr_stage_mutation_immutable BEFORE UPDATE OR DELETE ON order_stage_mutation FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_order_stage_configuration() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Stage configuration retained';END IF;
 IF NOT EXISTS(SELECT 1 FROM organization WHERE id=NEW.vendor_id AND type='VENDOR') THEN RAISE EXCEPTION 'Vendor stage configuration only';END IF;
 IF TG_OP='UPDATE' AND(NEW.vendor_id<>OLD.vendor_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Invalid configuration revision';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_stage_configuration BEFORE INSERT OR UPDATE OR DELETE ON order_stage_configuration FOR EACH ROW EXECUTE FUNCTION guard_order_stage_configuration();
CREATE FUNCTION guard_order_stage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Stages retire instead';END IF;
 PERFORM vendor_id FROM order_stage_configuration WHERE vendor_id=NEW.vendor_id FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 OR NEW.state<>'ACTIVE' OR(SELECT count(*) FROM order_stage WHERE vendor_id=NEW.vendor_id)>=20 THEN RAISE EXCEPTION 'Stage capacity/source invalid';END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.vendor_id<>OLD.vendor_id OR NEW.revision<>OLD.revision+1 OR(OLD.state='RETIRED' AND NEW.state<>'RETIRED') THEN RAISE EXCEPTION 'Invalid stage mutation';END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_order_stage BEFORE INSERT OR UPDATE OR DELETE ON order_stage FOR EACH ROW EXECUTE FUNCTION guard_order_stage();
CREATE FUNCTION guard_stage_creation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.original_result IS NULL AND OLD.original_result IS NOT NULL AND to_jsonb(NEW)-'original_result'=to_jsonb(OLD)-'original_result' THEN RETURN NEW;END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Stage creation identity retained';END IF;
 IF NOT EXISTS(SELECT 1 FROM order_stage s JOIN business_account b ON b.id=NEW.creator_id AND b.organization_id=s.vendor_id AND b.role IN ('OWNER','ADMIN') WHERE s.id=NEW.stage_id AND s.vendor_id=NEW.vendor_id) OR NEW.original_result IS NULL THEN RAISE EXCEPTION 'Invalid stage creator';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_stage_creation BEFORE INSERT OR UPDATE OR DELETE ON order_stage_creation FOR EACH ROW EXECUTE FUNCTION guard_stage_creation();
ALTER TABLE purchase_order_event ADD COLUMN stage_id uuid REFERENCES order_stage(id),ADD COLUMN stage_name varchar(100),ADD COLUMN previous_stage_id uuid REFERENCES order_stage(id),ADD COLUMN previous_stage_name varchar(100),ADD COLUMN stage_configuration_revision varchar(256),ADD COLUMN stage_configuration_version bigint,ADD COLUMN stage_assignment boolean NOT NULL DEFAULT false;
CREATE TABLE order_stage_assignment(order_id uuid NOT NULL REFERENCES purchase_order(id),vendor_id uuid NOT NULL REFERENCES organization(id),from_revision bigint NOT NULL CHECK(from_revision>=2),expected_revision varchar(256) NOT NULL,target_id uuid REFERENCES order_stage(id),payload jsonb NOT NULL,result jsonb NOT NULL,changed boolean NOT NULL,event_id uuid UNIQUE REFERENCES purchase_order_event(id) DEFERRABLE INITIALLY DEFERRED,actor_id uuid NOT NULL REFERENCES account_identity(id),created_at timestamptz(3) NOT NULL,PRIMARY KEY(order_id,expected_revision,payload),CHECK(changed=(event_id IS NOT NULL)));
CREATE UNIQUE INDEX ux_stage_assignment_changed ON order_stage_assignment(order_id,expected_revision) WHERE changed;
CREATE TRIGGER tr_stage_assignment_immutable BEFORE UPDATE OR DELETE ON order_stage_assignment FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_order_stage_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE e purchase_order_event%ROWTYPE;o purchase_order%ROWTYPE;frozen text;BEGIN
 SELECT * INTO o FROM purchase_order WHERE id=NEW.order_id;SELECT * INTO e FROM purchase_order_event WHERE order_id=NEW.order_id ORDER BY revision DESC LIMIT 1;
 IF o.vendor_id IS DISTINCT FROM NEW.vendor_id OR e.state IS DISTINCT FROM 'ACCEPTED' OR e.revision IS DISTINCT FROM NEW.from_revision OR NEW.created_at<e.created_at THEN RAISE EXCEPTION 'Invalid stage assignment source';END IF;
 IF NOT EXISTS(SELECT 1 FROM business_account b JOIN account_identity a ON a.id=b.id JOIN organization v ON v.id=b.organization_id WHERE b.id=NEW.actor_id AND b.organization_id=NEW.vendor_id AND a.state='ACTIVE' AND a.email_verified AND v.state='ACTIVE') THEN RAISE EXCEPTION 'Invalid stage actor';END IF;
 IF NEW.target_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM order_stage WHERE id=NEW.target_id AND vendor_id=NEW.vendor_id AND state='ACTIVE') THEN RAISE EXCEPTION 'Invalid stage target';END IF;
 IF NEW.changed IS DISTINCT FROM ((e.result#>>'{stage,id}')::uuid IS DISTINCT FROM NEW.target_id) OR(NEW.result->>'revision')::bigint IS DISTINCT FROM NEW.from_revision+(CASE WHEN NEW.changed THEN 1 ELSE 0 END) OR NEW.result->>'state' IS DISTINCT FROM 'ACCEPTED' OR(NEW.result#>>'{stage,id}')::uuid IS DISTINCT FROM NEW.target_id OR NEW.result->'cancellationRequestId' IS DISTINCT FROM COALESCE(e.result->'cancellationRequestId','null'::jsonb) OR NEW.result->'fulfillment' IS DISTINCT FROM e.result->'fulfillment' OR NEW.result->>'originalRevision' IS NULL THEN RAISE EXCEPTION 'Invalid assignment snapshot';END IF;
 FOREACH frozen IN ARRAY ARRAY['id','number','vendor','buyer','terms','submittedByAccountId','submittedByDisplayName','submittedAt'] LOOP IF NEW.result->frozen IS DISTINCT FROM e.result->frozen THEN RAISE EXCEPTION 'Assignment commercial snapshot immutable';END IF;END LOOP;RETURN NEW;END $$;
CREATE TRIGGER tr_stage_assignment_scope BEFORE INSERT ON order_stage_assignment FOR EACH ROW EXECUTE FUNCTION guard_order_stage_assignment();
ALTER TABLE purchase_order_event DROP CONSTRAINT ck_order_event_response;
ALTER TABLE purchase_order_event ADD CONSTRAINT ck_order_event_response CHECK(
 (revision=1 AND state='AWAITING_ACCEPTANCE' AND previous_state IS NULL AND reason IS NULL AND actor_organization_id IS NULL AND result IS NULL AND cancellation_request_id IS NULL AND cancellation_request_state IS NULL)
 OR(revision=2 AND previous_state IS NOT NULL AND previous_state='AWAITING_ACCEPTANCE' AND actor_organization_id IS NOT NULL AND actor_organization_id=vendor_id AND result IS NOT NULL AND jsonb_typeof(result)='object' AND cancellation_request_id IS NULL AND cancellation_request_state IS NULL AND((state='ACCEPTED' AND reason IS NULL) OR(state='REJECTED' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000)))
 OR(state='CANCELLED' AND revision>=2 AND previous_state IS NOT NULL AND previous_state IN ('AWAITING_ACCEPTANCE','ACCEPTED') AND actor_organization_id IS NOT NULL AND actor_organization_id IN (buyer_id,vendor_id) AND result IS NOT NULL AND jsonb_typeof(result)='object' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000 AND((cancellation_request_id IS NULL AND cancellation_request_state IS NULL) OR(cancellation_request_id IS NOT NULL AND cancellation_request_state IS NOT NULL AND cancellation_request_state IN ('APPROVED','RESOLVED'))))
 OR(state='ACCEPTED' AND revision>=3 AND previous_state IS NOT NULL AND previous_state='ACCEPTED' AND actor_organization_id IS NOT NULL AND actor_organization_id IN (buyer_id,vendor_id) AND result IS NOT NULL AND jsonb_typeof(result)='object' AND cancellation_request_id IS NOT NULL AND cancellation_request_state IS NOT NULL AND((cancellation_request_state IN ('PENDING','REJECTED') AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000) OR(cancellation_request_state='WITHDRAWN' AND reason IS NULL)))
 OR(stage_assignment AND state='ACCEPTED' AND revision>=3 AND previous_state IS NOT NULL AND previous_state='ACCEPTED' AND actor_organization_id IS NOT NULL AND actor_organization_id=vendor_id AND result IS NOT NULL AND jsonb_typeof(result)='object' AND reason IS NULL AND cancellation_request_id IS NULL AND cancellation_request_state IS NULL));
CREATE OR REPLACE FUNCTION guard_order_response_event() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE o purchase_order%ROWTYPE;r order_response%ROWTYPE;c order_cancellation%ROWTYPE;frozen text;source jsonb;q cancellation_request%ROWTYPE;z cancellation_resolution%ROWTYPE;BEGIN
 IF NEW.state='DISPATCHED' AND EXISTS(SELECT 1 FROM order_pending_cancellation WHERE order_id=NEW.order_id) THEN RAISE EXCEPTION 'Pending cancellation blocks dispatch';END IF;
 SELECT * INTO o FROM purchase_order WHERE id=NEW.order_id;
 IF o.id IS NULL OR NEW.buyer_id<>o.buyer_id OR NEW.vendor_id<>o.vendor_id THEN RAISE EXCEPTION 'Invalid event parties';END IF;
 IF NEW.revision=1 THEN
  IF NEW.actor_id<>o.submitted_by OR NEW.created_at<>o.submitted_at THEN RAISE EXCEPTION 'Invalid initial event';END IF;RETURN NEW;
 END IF;
 source:=o.snapshot;
 IF NEW.stage_assignment THEN
  SELECT COALESCE(e.result,o.snapshot) INTO source FROM purchase_order_event e WHERE e.order_id=o.id AND e.revision=NEW.revision-1;
  IF NEW.state<>'ACCEPTED' OR source->>'state' IS DISTINCT FROM 'ACCEPTED' OR NOT EXISTS(SELECT 1 FROM order_stage_assignment x WHERE x.event_id=NEW.id AND x.order_id=NEW.order_id AND x.vendor_id=NEW.vendor_id AND x.actor_id=NEW.actor_id AND x.created_at=NEW.created_at AND x.from_revision+1=NEW.revision AND x.changed AND x.result=NEW.result) OR NEW.result->'cancellationRequestId' IS DISTINCT FROM source->'cancellationRequestId' OR NEW.result->'fulfillment' IS DISTINCT FROM source->'fulfillment' THEN RAISE EXCEPTION 'Invalid stage assignment event';END IF;
 ELSIF NEW.state='CANCELLED' THEN
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
 ELSIF NOT NEW.stage_assignment THEN
  IF COALESCE(NEW.result->'cancellationRequestId','null'::jsonb) IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unexpected pending request';END IF;
 END IF;
 IF NEW.previous_stage_id IS DISTINCT FROM (source#>>'{stage,id}')::uuid OR NEW.stage_id IS DISTINCT FROM (NEW.result#>>'{stage,id}')::uuid OR(NOT NEW.stage_assignment AND NEW.stage_id IS DISTINCT FROM NEW.previous_stage_id) THEN RAISE EXCEPTION 'Invalid stage history identity';END IF;
 IF NEW.previous_stage_name IS DISTINCT FROM (SELECT name FROM order_stage WHERE id=NEW.previous_stage_id AND vendor_id=NEW.vendor_id) OR NEW.stage_name IS DISTINCT FROM (SELECT name FROM order_stage WHERE id=NEW.stage_id AND vendor_id=NEW.vendor_id) OR NEW.stage_name IS DISTINCT FROM NEW.result#>>'{stage,name}' THEN RAISE EXCEPTION 'Invalid frozen stage labels';END IF;
 IF NEW.stage_assignment OR NEW.stage_id IS NOT NULL OR NEW.previous_stage_id IS NOT NULL THEN
  IF NEW.stage_configuration_revision IS NULL OR NEW.stage_configuration_version IS DISTINCT FROM (SELECT revision FROM order_stage_configuration WHERE vendor_id=NEW.vendor_id) THEN RAISE EXCEPTION 'Invalid stage configuration snapshot';END IF;
 ELSIF NEW.stage_configuration_revision IS NOT NULL OR NEW.stage_configuration_version IS NOT NULL THEN RAISE EXCEPTION 'Unexpected stage configuration';END IF;
 IF (NEW.result->>'revision')::bigint IS DISTINCT FROM NEW.revision OR NEW.result->>'state' IS DISTINCT FROM NEW.state OR (NEW.result->>'updatedAt')::timestamptz IS DISTINCT FROM NEW.created_at OR NEW.result->>'originalRevision' IS NULL THEN RAISE EXCEPTION 'Invalid response snapshot';END IF;
 FOREACH frozen IN ARRAY ARRAY['id','number','vendor','buyer','terms','submittedByAccountId','submittedByDisplayName','submittedAt'] LOOP
  IF NEW.result->frozen IS DISTINCT FROM source->frozen THEN RAISE EXCEPTION 'Commercial snapshot immutable';END IF;
 END LOOP;RETURN NEW;END $$;
CREATE FUNCTION validate_stage_assignment_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.changed THEN
  IF NOT EXISTS(SELECT 1 FROM purchase_order_event e WHERE e.id=NEW.event_id AND e.order_id=NEW.order_id AND e.stage_assignment AND e.result=NEW.result) THEN RAISE EXCEPTION 'Stage event missing';END IF;
  IF EXISTS(SELECT 1 FROM purchase_order o JOIN business_account b ON b.organization_id=o.buyer_id JOIN account_identity a ON a.id=b.id JOIN organization g ON g.id=b.organization_id WHERE o.id=NEW.order_id AND g.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND(a.id=o.submitted_by OR b.role IN ('OWNER','ADMIN')) AND NOT EXISTS(SELECT 1 FROM order_notice n WHERE n.order_id=NEW.order_id AND n.event_id=NEW.event_id AND n.recipient_account_id=a.id AND(SELECT count(*) FROM order_delivery d WHERE d.notice_id=n.id)=3)) THEN RAISE EXCEPTION 'Stage status intent missing';END IF;
 END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_stage_assignment_complete AFTER INSERT ON order_stage_assignment DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_stage_assignment_complete();
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
 OR (resource_type='ORDER' AND action IN ('ORDER_SUBMITTED','ORDER_ACCEPTED','ORDER_REJECTED','ORDER_CANCELLED','ORDER_STAGE_CHANGED','CANCELLATION_REQUESTED','CANCELLATION_APPROVED','CANCELLATION_REJECTED','CANCELLATION_WITHDRAWN','CANCELLATION_RESOLVED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)

 OR(resource_type='ORDER_STAGE' AND action IN ('STAGE_CREATED','STAGE_RENAMED','STAGE_RETIRED','STAGES_REORDERED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=41 WHERE id=1;
