CREATE TABLE relationship_pricing(relationship_id uuid PRIMARY KEY REFERENCES trading_relationship(id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0));
INSERT INTO relationship_pricing(relationship_id) SELECT id FROM trading_relationship;
CREATE FUNCTION initialize_relationship_pricing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO relationship_pricing(relationship_id) VALUES(NEW.id);RETURN NEW;END;$$;
CREATE TRIGGER tr_relationship_pricing AFTER INSERT ON trading_relationship FOR EACH ROW EXECUTE FUNCTION initialize_relationship_pricing();
CREATE TABLE agreed_price(id uuid PRIMARY KEY,relationship_id uuid NOT NULL REFERENCES trading_relationship(id),product_id uuid NOT NULL REFERENCES catalogue_product(id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),unit_price numeric NOT NULL CHECK(unit_price>0 AND unit_price<=999999999.99 AND scale(unit_price)<=2),confirmed_generation bigint NOT NULL CHECK(confirmed_generation>=0),removed boolean NOT NULL DEFAULT false,created_at timestamptz(3) NOT NULL);
CREATE UNIQUE INDEX uk_current_agreed_price ON agreed_price(relationship_id,product_id) WHERE NOT removed;
CREATE INDEX ix_agreed_price_page ON agreed_price(relationship_id,created_at DESC,id ASC) WHERE NOT removed;
CREATE TABLE agreed_price_history(price_id uuid NOT NULL REFERENCES agreed_price(id),revision bigint NOT NULL,actor_id uuid NOT NULL REFERENCES account_identity(id),unit_price numeric(11,2) NOT NULL,confirmed_generation bigint NOT NULL,removed boolean NOT NULL,occurred_at timestamptz(3) NOT NULL,PRIMARY KEY(price_id,revision));
CREATE TRIGGER tr_agreed_price_history BEFORE UPDATE OR DELETE ON agreed_price_history FOR EACH ROW EXECUTE FUNCTION protect_pricing_history();
CREATE FUNCTION guard_agreed_price() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE r trading_relationship;BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Agreed price history retained' USING ERRCODE='23514';END IF;
 SELECT * INTO STRICT r FROM trading_relationship WHERE id=NEW.relationship_id;
 PERFORM id FROM organization WHERE id IN(r.vendor_id,r.buyer_id) ORDER BY id FOR UPDATE;
 SELECT * INTO STRICT r FROM trading_relationship WHERE id=NEW.relationship_id;
 IF NOT EXISTS(SELECT 1 FROM catalogue_product WHERE id=NEW.product_id AND vendor_id=r.vendor_id) OR NEW.confirmed_generation>r.connection_generation THEN RAISE EXCEPTION 'Invalid agreed price scope/generation' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (OLD.removed OR NEW.id<>OLD.id OR NEW.relationship_id<>OLD.relationship_id OR NEW.product_id<>OLD.product_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Invalid agreed price transition' USING ERRCODE='23514';END IF;
 IF TG_OP='INSERT' AND (NEW.revision<>1 OR NEW.removed) THEN RAISE EXCEPTION 'Invalid agreed price creation' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_agreed_price_guard BEFORE INSERT OR UPDATE OR DELETE ON agreed_price FOR EACH ROW EXECUTE FUNCTION guard_agreed_price();
CREATE FUNCTION advance_relationship_pricing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE relationship_pricing SET revision=revision+1 WHERE relationship_id=NEW.relationship_id;RETURN NEW;END;$$;
CREATE TRIGGER tr_advance_relationship_pricing AFTER INSERT OR UPDATE ON agreed_price FOR EACH ROW EXECUTE FUNCTION advance_relationship_pricing();
CREATE FUNCTION guard_relationship_pricing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Relationship pricing retained' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND (NEW.relationship_id<>OLD.relationship_id OR NEW.revision<>OLD.revision+1) THEN RAISE EXCEPTION 'Invalid relationship pricing revision' USING ERRCODE='23514';END IF;RETURN NEW;END;$$;
CREATE TRIGGER tr_guard_relationship_pricing BEFORE INSERT OR UPDATE OR DELETE ON relationship_pricing FOR EACH ROW EXECUTE FUNCTION guard_relationship_pricing();
CREATE OR REPLACE FUNCTION guard_trading_relationship() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE cap integer; parties integer; BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Relationship history retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.vendor_id<>OLD.vendor_id OR NEW.buyer_id<>OLD.buyer_id OR NEW.country<>OLD.country OR NEW.id<>OLD.id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
   OR NOT ((OLD.state='ACTIVE' AND NEW.state='DISCONNECTED' AND NEW.connection_generation=OLD.connection_generation AND NEW.agreed_price_confirmation_required=OLD.agreed_price_confirmation_required)
    OR (OLD.state='ACTIVE' AND NEW.state='ACTIVE' AND NEW.connection_generation=OLD.connection_generation AND NEW.agreed_price_confirmation_required<>OLD.agreed_price_confirmation_required)
    OR (OLD.state='DISCONNECTED' AND NEW.state='ACTIVE' AND NEW.connection_generation=OLD.connection_generation+1 AND NEW.agreed_price_confirmation_required)) THEN RAISE EXCEPTION 'Relationship transition invalid' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM id FROM organization WHERE id IN (NEW.vendor_id,NEW.buyer_id) ORDER BY id FOR UPDATE;
 SELECT count(*) INTO parties FROM organization WHERE (id=NEW.vendor_id AND type='VENDOR' AND country=NEW.country) OR (id=NEW.buyer_id AND type='BUYER' AND country=NEW.country);
 IF parties<>2 THEN RAISE EXCEPTION 'Domestic vendor buyer pair required' USING ERRCODE='23514'; END IF;
 IF NEW.state='ACTIVE' THEN
  IF EXISTS(SELECT 1 FROM organization WHERE id IN (NEW.vendor_id,NEW.buyer_id) AND state<>'ACTIVE') THEN RAISE EXCEPTION 'Active parties required' USING ERRCODE='23514'; END IF;
  SELECT p.active_buyer_limit INTO cap FROM organization_plan a JOIN plan_revision p ON p.id=a.plan_revision_id WHERE a.organization_id=NEW.vendor_id FOR SHARE OF a;
  IF cap IS NULL OR (SELECT count(*) FROM trading_relationship WHERE vendor_id=NEW.vendor_id AND state='ACTIVE' AND id<>NEW.id)>=cap THEN RAISE EXCEPTION 'Plan capacity required' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW; END; $$;
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
 OR (resource_type='PRODUCT' AND action IN ('PRODUCT_CREATED','PRODUCT_UPDATED','PRODUCT_ARCHIVED','PRODUCT_RESTORED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='PRODUCT_PRICING' AND action='PRICING_UPDATED' AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR (resource_type='AGREED_PRICE' AND action IN ('AGREED_PRICE_SAVED','AGREED_PRICE_REMOVED','AGREED_PRICE_CONFIRMED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=27 WHERE id=1;
