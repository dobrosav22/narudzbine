ALTER TABLE organization ADD COLUMN partner_contact_id uuid;
ALTER TABLE organization ADD CONSTRAINT fk_partner_contact FOREIGN KEY(id,partner_contact_id) REFERENCES business_contact(organization_id,id);
CREATE FUNCTION guard_partner_contact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.partner_contact_id IS NOT NULL THEN
  PERFORM id FROM business_contact WHERE id=NEW.partner_contact_id AND organization_id=NEW.id AND state='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active own business contact required' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_partner_contact BEFORE INSERT OR UPDATE OF partner_contact_id ON organization FOR EACH ROW EXECUTE FUNCTION guard_partner_contact();
CREATE FUNCTION guard_selected_contact_archive() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.state='ARCHIVED' AND EXISTS(SELECT 1 FROM organization WHERE id=NEW.organization_id AND partner_contact_id=NEW.id) THEN
  RAISE EXCEPTION 'Clear partner contact before archive' USING ERRCODE='23514';
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_selected_contact_archive BEFORE UPDATE OF state ON business_contact FOR EACH ROW EXECUTE FUNCTION guard_selected_contact_archive();
CREATE TABLE partner_snapshot (
 relationship_id uuid NOT NULL REFERENCES trading_relationship(id),relationship_revision bigint NOT NULL CHECK(relationship_revision>0),
 organization_id uuid NOT NULL REFERENCES organization(id),display_name varchar(200) NOT NULL,legal_name varchar(200) NOT NULL,
 country varchar(2) NOT NULL CHECK(country IN ('RS','BA')),currency varchar(3) NOT NULL,
 registration_identifier varchar(64) NOT NULL,tax_identifier varchar(64),
 contact_name varchar(100),contact_phone varchar(30),contact_email varchar(254),recorded_at timestamptz(3) NOT NULL,
 PRIMARY KEY(relationship_id,relationship_revision,organization_id),
 CHECK((country='RS' AND currency='RSD') OR (country='BA' AND currency='BAM')),
 CHECK((contact_name IS NULL AND contact_phone IS NULL AND contact_email IS NULL) OR (contact_name IS NOT NULL AND contact_phone IS NOT NULL))
);
CREATE TRIGGER tr_partner_snapshot_immutable BEFORE UPDATE OR DELETE ON partner_snapshot FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE FUNCTION guard_partner_snapshot_origin() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF pg_trigger_depth()<>2 OR NOT EXISTS(SELECT 1 FROM trading_relationship WHERE id=NEW.relationship_id AND revision=NEW.relationship_revision AND state='DISCONNECTED' AND NEW.organization_id IN (vendor_id,buyer_id) AND updated_at=NEW.recorded_at AND country=NEW.country) THEN
  RAISE EXCEPTION 'Snapshot requires actual disconnection transition' USING ERRCODE='23514';
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER tr_partner_snapshot_origin BEFORE INSERT ON partner_snapshot FOR EACH ROW EXECUTE FUNCTION guard_partner_snapshot_origin();
CREATE FUNCTION capture_disconnected_partners() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO partner_snapshot(relationship_id,relationship_revision,organization_id,display_name,legal_name,country,currency,registration_identifier,tax_identifier,contact_name,contact_phone,contact_email,recorded_at)
 SELECT NEW.id,NEW.revision,o.id,o.display_name,o.legal_name,o.country,o.currency,o.registration_identifier,o.tax_identifier,c.contact_name,c.contact_phone,c.contact_email,NEW.updated_at
 FROM organization o LEFT JOIN business_contact c ON c.organization_id=o.id AND c.id=o.partner_contact_id AND c.state='ACTIVE'
 WHERE o.id IN (NEW.vendor_id,NEW.buyer_id);
 RETURN NEW; END; $$;
CREATE TRIGGER tr_capture_disconnected_partners AFTER UPDATE OF state ON trading_relationship FOR EACH ROW WHEN(OLD.state='ACTIVE' AND NEW.state='DISCONNECTED') EXECUTE FUNCTION capture_disconnected_partners();
UPDATE backend_schema_version SET version=22 WHERE id=1;
