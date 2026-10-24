CREATE TABLE buyer_draft (
 id uuid PRIMARY KEY,buyer_id uuid NOT NULL REFERENCES organization(id),vendor_id uuid NOT NULL REFERENCES organization(id),
 preparation jsonb NOT NULL CHECK(jsonb_typeof(preparation)='object'),
 state varchar(9) NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','DISCARDED')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),discarded_from_revision bigint,
 creator_id uuid NOT NULL REFERENCES account_identity(id),last_editor_id uuid NOT NULL REFERENCES account_identity(id),
 created_at timestamptz(3) NOT NULL,updated_at timestamptz(3) NOT NULL,
 CHECK(buyer_id<>vendor_id),CHECK(updated_at>=created_at),
 CHECK((state='OPEN' AND discarded_from_revision IS NULL) OR (state='DISCARDED' AND discarded_from_revision=revision-1))
);
CREATE INDEX ix_buyer_draft_page ON buyer_draft(buyer_id,created_at DESC,id ASC) WHERE state='OPEN';
CREATE TABLE buyer_draft_line (
 draft_id uuid NOT NULL REFERENCES buyer_draft(id),position integer NOT NULL CHECK(position BETWEEN 0 AND 499),
 product_id uuid NOT NULL REFERENCES catalogue_product(id),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000000),
 PRIMARY KEY(draft_id,position),UNIQUE(draft_id,product_id)
);
CREATE TABLE draft_creation (
 draft_id uuid PRIMARY KEY REFERENCES buyer_draft(id),creator_id uuid NOT NULL REFERENCES account_identity(id),
 payload_hash bytea NOT NULL CHECK(octet_length(payload_hash)=32),original_snapshot jsonb,expires_at timestamptz(3) NOT NULL
);
CREATE TABLE draft_event (
 id uuid PRIMARY KEY,draft_id uuid NOT NULL REFERENCES buyer_draft(id),buyer_id uuid NOT NULL REFERENCES organization(id),
 actor_id uuid NOT NULL REFERENCES account_identity(id),revision bigint NOT NULL CHECK(revision>0),
 action varchar(9) NOT NULL CHECK(action IN ('CREATED','UPDATED','DISCARDED')),created_at timestamptz(3) NOT NULL,
 UNIQUE(draft_id,revision)
);
CREATE FUNCTION protect_buyer_draft() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF NEW.state='DISCARDED' AND NEW.preparation<>OLD.preparation THEN RAISE EXCEPTION 'Discard preserves intent'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM business_account WHERE id=NEW.last_editor_id AND organization_id=NEW.buyer_id) THEN RAISE EXCEPTION 'Draft editor must belong to buyer'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_buyer_draft BEFORE INSERT OR UPDATE OR DELETE ON buyer_draft FOR EACH ROW EXECUTE FUNCTION protect_buyer_draft();
CREATE FUNCTION protect_draft_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d buyer_draft%ROWTYPE;
BEGIN
 SELECT * INTO d FROM buyer_draft WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.draft_id ELSE NEW.draft_id END;
 IF d.state<>'OPEN' THEN RAISE EXCEPTION 'Terminal draft lines immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Replace draft lines explicitly'; END IF;
 IF NOT EXISTS(SELECT 1 FROM catalogue_product WHERE id=NEW.product_id AND vendor_id=d.vendor_id) THEN RAISE EXCEPTION 'Draft product vendor mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_draft_line BEFORE INSERT OR UPDATE OR DELETE ON buyer_draft_line FOR EACH ROW EXECUTE FUNCTION protect_draft_line();
CREATE FUNCTION protect_draft_creation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Draft creation identity retained'; END IF;
 IF NEW.draft_id<>OLD.draft_id OR NEW.creator_id<>OLD.creator_id OR NEW.payload_hash<>OLD.payload_hash OR NEW.expires_at<>OLD.expires_at
  OR NEW.original_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Only receipt payload compaction allowed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_draft_creation BEFORE UPDATE OR DELETE ON draft_creation FOR EACH ROW EXECUTE FUNCTION protect_draft_creation();
CREATE TRIGGER tr_draft_event BEFORE UPDATE OR DELETE ON draft_event FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
UPDATE backend_schema_version SET version=33 WHERE id=1;
