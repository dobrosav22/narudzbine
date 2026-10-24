-- Bounded normalized staging, permanent minimal confirmation identity and actual product mappings.
CREATE TABLE catalogue_import_preview(id uuid PRIMARY KEY,vendor_id uuid NOT NULL REFERENCES organization(id),creator_id uuid NOT NULL REFERENCES account_identity(id),created_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL,row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 1000),requires_price boolean NOT NULL,valid boolean NOT NULL,rows jsonb,errors jsonb,original_revision varchar(256) NOT NULL,CHECK(expires_at=created_at+interval '30 minutes'),CHECK((rows IS NULL)=(errors IS NULL)),CHECK(rows IS NULL OR(jsonb_typeof(rows)='array' AND jsonb_array_length(rows)<=row_count AND jsonb_typeof(errors)='array' AND jsonb_array_length(errors)<=100000 AND valid=(jsonb_array_length(errors)=0))));
CREATE FUNCTION guard_import_preview() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.rows IS NULL AND NEW.errors IS NULL AND OLD.rows IS NOT NULL AND to_jsonb(NEW)-ARRAY['rows','errors']=to_jsonb(OLD)-ARRAY['rows','errors'] THEN RETURN NEW;END IF;
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Import metadata retained';END IF;
 IF NEW.rows IS NULL OR NOT EXISTS(SELECT 1 FROM business_account b JOIN account_identity a ON a.id=b.id JOIN organization v ON v.id=b.organization_id WHERE b.id=NEW.creator_id AND b.organization_id=NEW.vendor_id AND v.type='VENDOR' AND v.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified) THEN RAISE EXCEPTION 'Invalid import creator';END IF;
 IF NEW.valid AND jsonb_array_length(NEW.rows)<>NEW.row_count THEN RAISE EXCEPTION 'Valid import must contain every row';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_import_preview BEFORE INSERT OR UPDATE OR DELETE ON catalogue_import_preview FOR EACH ROW EXECUTE FUNCTION guard_import_preview();
CREATE TABLE catalogue_import_product(preview_id uuid NOT NULL REFERENCES catalogue_import_preview(id),row_number integer NOT NULL CHECK(row_number BETWEEN 1 AND 1000),product_id uuid NOT NULL UNIQUE REFERENCES catalogue_product(id),vendor_id uuid NOT NULL REFERENCES organization(id),PRIMARY KEY(preview_id,row_number));
CREATE TRIGGER tr_import_product_immutable BEFORE UPDATE OR DELETE ON catalogue_import_product FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_import_product() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p catalogue_import_preview%ROWTYPE;proposed jsonb;BEGIN
 SELECT * INTO p FROM catalogue_import_preview WHERE id=NEW.preview_id;
 proposed:=p.rows->(NEW.row_number-1);
 IF p.vendor_id IS DISTINCT FROM NEW.vendor_id OR NOT p.valid OR(proposed->>'row')::integer IS DISTINCT FROM NEW.row_number OR(proposed->>'id')::uuid IS DISTINCT FROM NEW.product_id OR NOT EXISTS(SELECT 1 FROM catalogue_product c JOIN catalogue_product_identity i ON i.id=c.id JOIN product_creation r ON r.product_id=c.id WHERE c.id=NEW.product_id AND c.vendor_id=NEW.vendor_id AND r.vendor_id=NEW.vendor_id AND c.created_at>=p.created_at AND c.created_at<p.expires_at AND c.sku=proposed#>>'{product,sku}' AND c.name=proposed#>>'{product,name}' AND c.description IS NOT DISTINCT FROM proposed#>>'{product,description}' AND c.pack_description IS NOT DISTINCT FROM proposed#>>'{product,packDescription}' AND i.unit_id IS NOT DISTINCT FROM(proposed#>>'{product,unitId}')::uuid AND i.category_id IS NOT DISTINCT FROM(proposed#>>'{product,categoryId}')::uuid AND c.minimum_quantity=(proposed#>>'{product,minimumQuantity}')::integer AND c.quantity_step=(proposed#>>'{product,quantityStep}')::integer AND NOT i.archived AND i.active=(proposed->>'activate')::boolean AND NOT c.featured) THEN RAISE EXCEPTION 'Import product differs from actual normalized creation';END IF;
 IF EXISTS(SELECT 1 FROM catalogue_product_tag t WHERE t.product_id=NEW.product_id AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(proposed#>'{product,tagIds}') x WHERE x::uuid=t.taxonomy_id)) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(proposed#>'{product,tagIds}') x WHERE NOT EXISTS(SELECT 1 FROM catalogue_product_tag t WHERE t.product_id=NEW.product_id AND t.taxonomy_id=x::uuid)) THEN RAISE EXCEPTION 'Import tags differ';END IF;
 IF NOT EXISTS(SELECT 1 FROM product_pricing q WHERE q.product_id=NEW.product_id AND q.base_price IS NOT DISTINCT FROM(proposed->>'basePrice')::numeric) OR EXISTS(SELECT 1 FROM product_volume_tier WHERE product_id=NEW.product_id) OR EXISTS(SELECT 1 FROM stock_balance WHERE product_id=NEW.product_id AND(available_count IS NOT NULL OR credit_quantity<>0 OR confirmed_epoch<>0)) THEN RAISE EXCEPTION 'Import price/stock differs';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_import_product_scope BEFORE INSERT ON catalogue_import_product FOR EACH ROW EXECUTE FUNCTION guard_import_product();
CREATE TABLE catalogue_import_success(preview_id uuid PRIMARY KEY REFERENCES catalogue_import_preview(id),vendor_id uuid NOT NULL REFERENCES organization(id),actor_id uuid NOT NULL REFERENCES account_identity(id),expected_revision varchar(256) NOT NULL,completed_at timestamptz(3) NOT NULL,result jsonb NOT NULL);
CREATE TRIGGER tr_import_success_immutable BEFORE UPDATE OR DELETE ON catalogue_import_success FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_import_success() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p catalogue_import_preview%ROWTYPE;BEGIN
 SELECT * INTO p FROM catalogue_import_preview WHERE id=NEW.preview_id;
 IF p.vendor_id IS DISTINCT FROM NEW.vendor_id OR NOT p.valid OR p.rows IS NULL OR NEW.expected_revision IS DISTINCT FROM p.original_revision OR NEW.completed_at<p.created_at OR NEW.completed_at>=p.expires_at OR NOT EXISTS(SELECT 1 FROM business_account b JOIN account_identity a ON a.id=b.id JOIN organization v ON v.id=b.organization_id WHERE b.id=NEW.actor_id AND b.organization_id=NEW.vendor_id AND v.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified) THEN RAISE EXCEPTION 'Invalid import success authority/source';END IF;
 IF(NEW.result->>'id')::uuid IS DISTINCT FROM NEW.preview_id OR(NEW.result->>'completedAt')::timestamptz IS DISTINCT FROM NEW.completed_at OR NEW.result->'productIds' IS DISTINCT FROM(SELECT jsonb_agg(x->'id' ORDER BY(x->>'row')::integer) FROM jsonb_array_elements(p.rows) x) THEN RAISE EXCEPTION 'Invalid frozen import result';END IF;RETURN NEW;END $$;
CREATE TRIGGER tr_import_success_scope BEFORE INSERT ON catalogue_import_success FOR EACH ROW EXECUTE FUNCTION guard_import_success();
CREATE FUNCTION validate_import_complete() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid;p catalogue_import_preview%ROWTYPE;s catalogue_import_success%ROWTYPE;BEGIN
 target:=NEW.preview_id;SELECT * INTO p FROM catalogue_import_preview WHERE id=target;SELECT * INTO s FROM catalogue_import_success WHERE preview_id=target;
 IF s.preview_id IS NULL OR(SELECT count(*) FROM catalogue_import_product WHERE preview_id=target)<>p.row_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(p.rows) x WHERE NOT EXISTS(SELECT 1 FROM catalogue_import_product r JOIN product_creation c ON c.product_id=r.product_id JOIN catalogue_product d ON d.id=r.product_id WHERE r.preview_id=target AND r.row_number=(x->>'row')::integer AND r.product_id=(x->>'id')::uuid AND r.vendor_id=p.vendor_id AND c.creator_id=s.actor_id AND d.created_at<=s.completed_at)) THEN RAISE EXCEPTION 'Incomplete atomic import';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_import_success_complete AFTER INSERT ON catalogue_import_success DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_import_complete();
CREATE FUNCTION validate_import_mapping_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM catalogue_import_success WHERE preview_id=NEW.preview_id) THEN RAISE EXCEPTION 'Import success missing';END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER ct_import_product_complete AFTER INSERT ON catalogue_import_product DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_import_mapping_complete();
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
 OR(resource_type='IMPORT' AND action IN('IMPORT_PREVIEWED','IMPORT_CONFIRMED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
 OR(resource_type='ORDER_STAGE' AND action IN ('STAGE_CREATED','STAGE_RENAMED','STAGE_RETIRED','STAGES_REORDERED') AND actor_type='BUSINESS' AND organization_id IS NOT NULL)
);
UPDATE backend_schema_version SET version=45 WHERE id=1;
