-- Apply through reviewed environment migration/grant tooling, never runtime DDL.
-- Substitute the actual environment runtime role. No private reason SELECT or commercial purge authority.
GRANT INSERT ON privacy_case TO narudzbine_runtime;
GRANT SELECT(id) ON privacy_case TO narudzbine_runtime; -- ON CONFLICT identity check only
GRANT SELECT ON privacy_case_metadata TO narudzbine_runtime;
GRANT SELECT,INSERT ON privacy_case_creation TO narudzbine_runtime;
GRANT UPDATE(original_response) ON privacy_case_creation TO narudzbine_runtime;
-- Existing organization/account/audit grants remain required. Never grant UPDATE/DELETE/TRUNCATE on privacy_case.
