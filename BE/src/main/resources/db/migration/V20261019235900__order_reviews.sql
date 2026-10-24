CREATE TABLE order_review (
 id uuid PRIMARY KEY,buyer_id uuid NOT NULL REFERENCES organization(id),vendor_id uuid NOT NULL REFERENCES organization(id),country varchar(2) NOT NULL CHECK(country IN ('RS','BA')),
 creator_id uuid NOT NULL REFERENCES account_identity(id),relationship_id uuid NOT NULL REFERENCES trading_relationship(id),relationship_generation bigint NOT NULL CHECK(relationship_generation>0),
 draft_id uuid REFERENCES buyer_draft(id),draft_revision bigint,
 intent_hash bytea NOT NULL CHECK(octet_length(intent_hash)=32),terms_hash bytea NOT NULL CHECK(octet_length(terms_hash)=32),
 original_intent jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz(3) NOT NULL,expires_at timestamptz(3) NOT NULL,
 CHECK(buyer_id<>vendor_id),CHECK(expires_at=created_at+interval '15 minutes'),
 CHECK((draft_id IS NULL AND draft_revision IS NULL) OR (draft_id IS NOT NULL AND draft_revision>0))
);
CREATE INDEX ix_order_review_expiry ON order_review(expires_at,id);
CREATE FUNCTION protect_order_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cutoff timestamptz;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Review immutable'; END IF;
 IF TG_OP='DELETE' THEN
  cutoff:=NULLIF(current_setting('narudzbine.review_purge_at',true),'')::timestamptz;
  IF cutoff IS NULL OR OLD.expires_at>cutoff THEN RAISE EXCEPTION 'Only expired review maintenance purge permitted'; END IF;
  RETURN OLD;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM organization b JOIN organization v ON v.id=NEW.vendor_id
  JOIN trading_relationship r ON r.id=NEW.relationship_id AND r.buyer_id=b.id AND r.vendor_id=v.id AND r.country=b.country AND r.connection_generation=NEW.relationship_generation AND r.state='ACTIVE'
  JOIN business_account a ON a.id=NEW.creator_id AND a.organization_id=b.id
  WHERE b.id=NEW.buyer_id AND b.type='BUYER' AND v.type='VENDOR' AND b.country=v.country AND b.country=NEW.country AND b.state='ACTIVE' AND v.state='ACTIVE')
 THEN RAISE EXCEPTION 'Review requires domestic scoped parties/actor/relationship'; END IF;
 IF NEW.draft_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM buyer_draft d WHERE d.id=NEW.draft_id AND d.buyer_id=NEW.buyer_id AND d.vendor_id=NEW.vendor_id AND d.state='OPEN' AND d.revision=NEW.draft_revision)
 THEN RAISE EXCEPTION 'Review requires current own draft'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tr_order_review BEFORE INSERT OR UPDATE OR DELETE ON order_review FOR EACH ROW EXECUTE FUNCTION protect_order_review();
UPDATE backend_schema_version SET version=34 WHERE id=1;
