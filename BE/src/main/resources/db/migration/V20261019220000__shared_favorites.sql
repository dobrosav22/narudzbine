CREATE TABLE buyer_favorite (
 buyer_id uuid NOT NULL REFERENCES organization(id),
 vendor_id uuid NOT NULL,
 product_id uuid NOT NULL,
 created_at timestamptz(3) NOT NULL,
 PRIMARY KEY(buyer_id,product_id),
 FOREIGN KEY(vendor_id,product_id) REFERENCES catalogue_product_identity(vendor_id,id),
 CHECK(buyer_id<>vendor_id)
);
CREATE INDEX ix_buyer_favorite_page ON buyer_favorite(buyer_id,created_at DESC,product_id ASC);
CREATE FUNCTION protect_buyer_favorite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Favorite bindings are immutable'; END IF;
 IF NOT EXISTS (SELECT 1 FROM organization b JOIN organization v ON v.id=NEW.vendor_id
  WHERE b.id=NEW.buyer_id AND b.type='BUYER' AND v.type='VENDOR' AND b.country=v.country) THEN
  RAISE EXCEPTION 'Favorite requires domestic buyer and vendor';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ct_buyer_favorite BEFORE INSERT OR UPDATE ON buyer_favorite FOR EACH ROW EXECUTE FUNCTION protect_buyer_favorite();
UPDATE backend_schema_version SET version=32 WHERE id=1;
