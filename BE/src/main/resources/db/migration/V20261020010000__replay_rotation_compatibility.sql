CREATE TABLE replay_fingerprint_binding(id smallint PRIMARY KEY CHECK(id=1),fingerprint bytea NOT NULL CHECK(octet_length(fingerprint)=32),created_at timestamptz(3) NOT NULL);
CREATE TRIGGER tr_replay_fingerprint_binding BEFORE UPDATE OR DELETE ON replay_fingerprint_binding FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
ALTER TABLE stock_replay ADD COLUMN original_revision varchar(256);
ALTER TABLE invitation_resend ADD COLUMN original_revision varchar(256);
-- NULL denotes a preserved pre-upgrade receipt; its original signature uses the pinned legacy key.
UPDATE backend_schema_version SET version=36 WHERE id=1;
