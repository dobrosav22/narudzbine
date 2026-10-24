# Locale roster and staff self-deactivation

2026-10-21 delegated implementation refinement under D-GOV-005, existing listLocales/deactivateSelf contracts and R-ORG-048. Recorded before dependent code. Backend/infrastructure only.

GET /locales returns the immutable canonical configuration roster in configuration order, with no query/body, labels or frontend translation ownership. Adding languages requires reviewed configuration/resources/contract changes; no schema change.

POST /me/deactivation accepts the current signed account revision and returns204. Reuse current MemberService DEACTIVATE authorization and effects: STAFF only for self, ADMIN requires owner, sole OWNER must transfer first. Route the actual authenticated account, acquire the existing organization/account/session guards, reauthenticate and check browser CSRF/current role/revision. Record activity before revoking all sessions. Clear the browser cookie only on success. Preserve original organization/country, historical attribution and prepared work; invalidate pending ownership acceptance through the existing service. No new notice, personal toggle, retry key, account reassignment or schema migration.

Verify public roster/immutable extensibility/strict input/CORS and staff both countries/types, all-session revocation, role boundaries, stale revision, CSRF/cookie, pending transfer, actual permission races and atomic audit rollback. Full wrapper and distinct review precede privacy implementation. Privacy fulfillment and real provider/operator/release evidence remain separate gates.
