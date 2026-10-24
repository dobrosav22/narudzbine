CREATE TABLE backend_schema_version (
    id integer PRIMARY KEY CHECK (id = 1),
    version integer NOT NULL CHECK (version > 0)
);
INSERT INTO backend_schema_version (id, version) VALUES (1, 1);
COMMENT ON TABLE backend_schema_version IS 'Runtime compatibility marker; changed only through Flyway.';
