ALTER TABLE organization_plan ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE TABLE catalogue_product_identity(id uuid PRIMARY KEY,vendor_id uuid NOT NULL REFERENCES organization(id),archived boolean NOT NULL DEFAULT false);
CREATE INDEX ix_catalogue_product_usage ON catalogue_product_identity(vendor_id) WHERE NOT archived;
CREATE FUNCTION guard_catalogue_product_identity() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE cap integer; BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Product identity retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.vendor_id<>OLD.vendor_id) THEN RAISE EXCEPTION 'Product binding immutable' USING ERRCODE='23514'; END IF;
 PERFORM id FROM organization WHERE id=NEW.vendor_id AND type='VENDOR' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vendor required' USING ERRCODE='23514'; END IF;
 IF NOT NEW.archived AND (TG_OP='INSERT' OR OLD.archived) THEN
  SELECT p.product_limit INTO cap FROM organization_plan a JOIN plan_revision p ON p.id=a.plan_revision_id WHERE a.organization_id=NEW.vendor_id FOR SHARE OF a;
  IF cap IS NULL OR (SELECT count(*) FROM catalogue_product_identity WHERE vendor_id=NEW.vendor_id AND NOT archived AND id<>NEW.id)>=cap THEN RAISE EXCEPTION 'Product capacity required' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_catalogue_product_identity BEFORE INSERT OR UPDATE OR DELETE ON catalogue_product_identity FOR EACH ROW EXECUTE FUNCTION guard_catalogue_product_identity();
CREATE FUNCTION guard_plan_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE cap_product integer; cap_buyer integer; retired_target boolean; BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Assignment retained' USING ERRCODE='23514'; END IF;
 IF NEW.organization_id<>OLD.organization_id OR NEW.revision<>OLD.revision+1 OR NEW.plan_revision_id=OLD.plan_revision_id THEN RAISE EXCEPTION 'Assignment transition invalid' USING ERRCODE='23514'; END IF;
 PERFORM id FROM organization WHERE id=NEW.organization_id AND type='VENDOR' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vendor required' USING ERRCODE='23514'; END IF;
 SELECT product_limit,active_buyer_limit,retired INTO cap_product,cap_buyer,retired_target FROM plan_revision WHERE id=NEW.plan_revision_id FOR SHARE;
 IF retired_target OR (SELECT count(*) FROM catalogue_product_identity WHERE vendor_id=NEW.organization_id AND NOT archived)>cap_product OR (SELECT count(*) FROM trading_relationship WHERE vendor_id=NEW.organization_id AND state='ACTIVE')>cap_buyer THEN RAISE EXCEPTION 'Available compliant plan required' USING ERRCODE='23514'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER tr_plan_assignment BEFORE UPDATE OR DELETE ON organization_plan FOR EACH ROW EXECUTE FUNCTION guard_plan_assignment();
CREATE TABLE plan_change_request (
 id uuid PRIMARY KEY,vendor_id uuid NOT NULL REFERENCES organization(id),requested_plan_revision_id uuid NOT NULL REFERENCES plan_revision(id),
 state varchar(12) NOT NULL CHECK(state IN ('PENDING','APPROVED','REJECTED','WITHDRAWN','SUPERSEDED')),resolution_reason varchar(1000),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL,
 CHECK((state IN ('PENDING','WITHDRAWN') AND resolution_reason IS NULL) OR (state IN ('APPROVED','REJECTED','SUPERSEDED') AND length(btrim(resolution_reason))>0 AND resolution_reason IS NOT NULL))
);
CREATE UNIQUE INDEX uk_pending_plan_request ON plan_change_request(vendor_id) WHERE state='PENDING';
CREATE INDEX ix_plan_request_list ON plan_change_request(vendor_id,created_at DESC,id);
CREATE FUNCTION protect_plan_request() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Request history retained' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','resolution_reason','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','resolution_reason','revision','updated_at']) OR OLD.state<>'PENDING' OR NEW.state='PENDING' OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Request transition invalid' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_plan_request BEFORE UPDATE OR DELETE ON plan_change_request FOR EACH ROW EXECUTE FUNCTION protect_plan_request();
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
 OR (resource_type='RELATIONSHIP' AND action IN ('TRADING_CONNECTED','TRADING_RECONNECTED','TRADING_ADMIN_CONNECTED','TRADING_DISCONNECTED') AND actor_type IN ('BUSINESS','PLATFORM_ADMIN'))
 OR (resource_type='VENDOR_PLAN' AND action='PLAN_ASSIGNED' AND actor_type='PLATFORM_ADMIN')
 OR (resource_type='PLAN_REQUEST' AND action IN ('PLAN_REQUESTED','PLAN_WITHDRAWN','PLAN_APPROVED','PLAN_REJECTED','PLAN_SUPERSEDED'))
);
UPDATE backend_schema_version SET version=23 WHERE id=1;
