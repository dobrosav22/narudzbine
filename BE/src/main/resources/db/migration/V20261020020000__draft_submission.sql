-- Extend genuine ordering; existing direct snapshots/receipts remain unchanged.
ALTER TABLE buyer_draft ADD COLUMN submitted_order_id uuid UNIQUE REFERENCES purchase_order(id);
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='buyer_draft'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%state%' LOOP
  EXECUTE format('ALTER TABLE buyer_draft DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE buyer_draft ADD CONSTRAINT ck_draft_terminal CHECK(
 (state='OPEN' AND discarded_from_revision IS NULL AND submitted_order_id IS NULL)
 OR (state='DISCARDED' AND discarded_from_revision IS NOT NULL AND discarded_from_revision=revision-1 AND submitted_order_id IS NULL)
 OR (state='SUBMITTED' AND discarded_from_revision IS NULL AND submitted_order_id IS NOT NULL));
ALTER TABLE draft_event DROP CONSTRAINT draft_event_action_check;
ALTER TABLE draft_event ADD CONSTRAINT draft_event_action_check CHECK(action IN ('CREATED','UPDATED','DISCARDED','SUBMITTED'));
ALTER TABLE purchase_order ADD COLUMN draft_id uuid UNIQUE REFERENCES buyer_draft(id),ADD COLUMN draft_revision bigint;
ALTER TABLE purchase_order ADD CONSTRAINT ck_order_draft_source CHECK((draft_id IS NULL AND draft_revision IS NULL) OR (draft_id IS NOT NULL AND draft_revision IS NOT NULL AND draft_revision>0));
CREATE TABLE draft_order_submission(
 draft_id uuid PRIMARY KEY REFERENCES buyer_draft(id),buyer_id uuid NOT NULL REFERENCES organization(id),vendor_id uuid NOT NULL REFERENCES organization(id),
 draft_revision bigint NOT NULL CHECK(draft_revision>0),review_id uuid NOT NULL,expected_revision varchar(256) NOT NULL CHECK(length(expected_revision)>0),order_id uuid NOT NULL UNIQUE REFERENCES purchase_order(id)
);
CREATE FUNCTION guard_draft_submission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM purchase_order o JOIN buyer_draft d ON d.id=o.draft_id WHERE o.id=NEW.order_id AND o.draft_id=NEW.draft_id AND o.buyer_id=NEW.buyer_id AND o.vendor_id=NEW.vendor_id AND o.review_id=NEW.review_id AND o.draft_revision=NEW.draft_revision AND d.state='OPEN' AND d.revision=NEW.draft_revision) THEN RAISE EXCEPTION 'Invalid draft success';END IF;
 RETURN NEW;END $$;
CREATE TRIGGER tr_draft_submission_scope BEFORE INSERT ON draft_order_submission FOR EACH ROW EXECUTE FUNCTION guard_draft_submission();
CREATE TRIGGER tr_draft_submission_immutable BEFORE UPDATE OR DELETE ON draft_order_submission FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE OR REPLACE FUNCTION guard_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Submitted order snapshot immutable';END IF;
 IF NOT EXISTS(SELECT 1 FROM organization b JOIN organization v ON v.id=NEW.vendor_id JOIN business_account a ON a.id=NEW.submitted_by AND a.organization_id=b.id
 JOIN order_review r ON r.id=NEW.review_id AND r.buyer_id=b.id AND r.vendor_id=v.id AND r.draft_id IS NOT DISTINCT FROM NEW.draft_id AND r.draft_revision IS NOT DISTINCT FROM NEW.draft_revision AND r.expires_at>NEW.submitted_at
 JOIN trading_relationship t ON t.id=r.relationship_id AND t.connection_generation=r.relationship_generation AND t.state='ACTIVE'
 WHERE b.id=NEW.buyer_id AND b.type='BUYER' AND v.type='VENDOR' AND b.country=v.country AND b.country=NEW.country AND b.state='ACTIVE' AND v.state='ACTIVE') THEN RAISE EXCEPTION 'Invalid order scope/review';END IF;
 IF NEW.draft_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM buyer_draft d WHERE d.id=NEW.draft_id AND d.buyer_id=NEW.buyer_id AND d.vendor_id=NEW.vendor_id AND d.state='OPEN' AND d.revision=NEW.draft_revision) THEN RAISE EXCEPTION 'Invalid draft order source';END IF;
 IF NEW.local_year<>extract(year FROM NEW.submitted_at AT TIME ZONE CASE WHEN NEW.country='RS' THEN 'Europe/Belgrade' ELSE 'Europe/Sarajevo' END)::integer THEN RAISE EXCEPTION 'Invalid order year';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION protect_buyer_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Draft source retained'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 OR NEW.state<>'OPEN' OR NOT EXISTS (
   SELECT 1 FROM organization b JOIN organization v ON v.id=NEW.vendor_id
   JOIN business_account a ON a.id=NEW.creator_id AND a.organization_id=b.id
   WHERE b.id=NEW.buyer_id AND b.type='BUYER' AND v.type='VENDOR' AND b.country=v.country
  ) THEN RAISE EXCEPTION 'Draft requires domestic parties and original buyer author'; END IF;
 ELSE
  IF OLD.state<>'OPEN' OR NEW.id<>OLD.id OR NEW.buyer_id<>OLD.buyer_id OR NEW.vendor_id<>OLD.vendor_id
   OR NEW.creator_id<>OLD.creator_id OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
   OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Draft binding/revision invalid'; END IF;
  IF NEW.state IN ('DISCARDED','SUBMITTED') AND NEW.preparation<>OLD.preparation THEN RAISE EXCEPTION 'Discard preserves intent'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM business_account WHERE id=NEW.last_editor_id AND organization_id=NEW.buyer_id) THEN RAISE EXCEPTION 'Draft editor must belong to buyer'; END IF;
 IF NEW.state='SUBMITTED' AND NOT EXISTS(SELECT 1 FROM draft_order_submission s JOIN purchase_order o ON o.id=s.order_id WHERE s.draft_id=NEW.id AND s.order_id=NEW.submitted_order_id AND s.buyer_id=NEW.buyer_id AND s.vendor_id=NEW.vendor_id AND s.draft_revision=OLD.revision AND o.submitted_by=NEW.last_editor_id AND o.submitted_at=NEW.updated_at) THEN RAISE EXCEPTION 'Draft requires actual atomic order';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION validate_complete_order() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE line_count integer;BEGIN
 SELECT count(*) INTO line_count FROM purchase_order_line WHERE order_id=NEW.id;
 IF line_count NOT BETWEEN 1 AND 500 OR line_count<>(SELECT count(*) FROM order_stock_obligation WHERE order_id=NEW.id) OR NOT EXISTS(SELECT 1 FROM purchase_order_event WHERE order_id=NEW.id) OR (NEW.draft_id IS NULL AND NOT EXISTS(SELECT 1 FROM order_submission_replay WHERE order_id=NEW.id))
 OR (NEW.draft_id IS NOT NULL AND (EXISTS(SELECT 1 FROM order_submission_replay WHERE order_id=NEW.id) OR NOT EXISTS(
 SELECT 1 FROM draft_order_submission s JOIN buyer_draft d ON d.id=s.draft_id
 JOIN draft_event e ON e.draft_id=d.id AND e.revision=d.revision AND e.action='SUBMITTED' AND e.actor_id=NEW.submitted_by
 WHERE s.order_id=NEW.id AND s.draft_id=NEW.draft_id AND d.state='SUBMITTED' AND d.submitted_order_id=NEW.id AND d.revision=NEW.draft_revision+1
 AND s.draft_revision=NEW.draft_revision AND s.review_id=NEW.review_id)))
 OR (NEW.draft_id IS NOT NULL AND (line_count<>(SELECT count(*) FROM buyer_draft_line WHERE draft_id=NEW.draft_id) OR EXISTS(SELECT 1 FROM buyer_draft_line d WHERE d.draft_id=NEW.draft_id AND NOT EXISTS(SELECT 1 FROM purchase_order_line l WHERE l.order_id=NEW.id AND l.product_id=d.product_id AND l.quantity=d.quantity)))) OR EXISTS(SELECT 1 FROM order_stock_obligation l WHERE l.order_id=NEW.id AND l.deducted<>EXISTS(SELECT 1 FROM stock_event e WHERE e.order_id=l.order_id AND e.product_id=l.product_id AND e.type='ORDER_DEDUCTED' AND e.delta=-l.quantity)) THEN RAISE EXCEPTION 'Order transaction incomplete';END IF;RETURN NULL;
END $$;
UPDATE backend_schema_version SET version=37 WHERE id=1;
