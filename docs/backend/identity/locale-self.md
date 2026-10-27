# Locale roster and staff self-deactivation

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/LOCALE_SELF_IMPLEMENTATION.md`: Locale roster and staff self-deactivation._

2026-10-21 delegated implementation refinement under D-GOV-005, existing listLocales/deactivateSelf contracts and R-ORG-048. Recorded before dependent code. Backend/infrastructure only.

GET /locales returns the immutable canonical configuration roster in configuration order, with no query/body, labels or frontend translation ownership. Adding languages requires reviewed configuration/resources/contract changes; no schema change.

POST /me/deactivation accepts the current signed account revision and returns204. Reuse current MemberService DEACTIVATE authorization and effects: STAFF only for self, ADMIN requires owner, sole OWNER must transfer first. Route the actual authenticated account, acquire the existing organization/account/session guards, reauthenticate and check browser CSRF/current role/revision. Record activity before revoking all sessions. Clear the browser cookie only on success. Preserve original organization/country, historical attribution and prepared work; invalidate pending ownership acceptance through the existing service. No new notice, personal toggle, retry key, account reassignment or schema migration.

Verify public roster/immutable extensibility/strict input/CORS and staff both countries/types, all-session revocation, role boundaries, stale revision, CSRF/cookie, pending transfer, actual permission races and atomic audit rollback. Full wrapper and distinct review precede privacy implementation. Privacy fulfillment and real provider/operator/release evidence remain separate gates.

## Verification

_Originally `BE/LOCALE_SELF_VERIFICATION.md`: Locale and staff self-deactivation verification._

2026-10-21. [Refinement](#implementation). Existing listLocales/deactivateSelf locally verified, schema58 unchanged;206 configured/209 planned operations. Backend/infrastructure only.

Final .tools/locale-self-final-verify.log: BUILD SUCCESS,1199 passed (155 unit/1044 PostgreSQL/native integration), zero failures/errors/skips. Focus155 unit/35 HTTP tests passed, including eight new locale/self cases. Public canonical ordered roster, immutable extensibility/validation, no body/query and CORS; staff both countries/types, all-device revocation/permanent binding, owner/admin/platform boundaries, current revision and browser CSRF/cookie, atomic audit failure rollback, actual role-change lock wait and pending ownership acceptance invalidation checked. Existing member tests exercise the underlying shared policy and history effects.

Distinct primary review: .tools/locale-self-review.md. No duplicate removal policy, account reassignment, notice/provider write or schema marker bump. Existing organization/account/session guard order and final current authority are reused; activity precedes revocation. Public locale configuration remains backend outbound-resource scope, with client translations externally owned.

Artifact narudzbine-backend:vs12-locale-self: sha256:d653a0ec3fe0adabd6dcd9f4b1bd424f75b1d6c4f814156865fa5975c870c111; JAR SHA256 f71dbb5dda4f2375b9a393e8681b33f3ec172be76694b5afca7d367c30b4f1f2. All814 application classes/63 source resources match packaged/tested content; native fixture/production binary and Java class match. 508 frozen inputs unchanged. Packaged migration58, nonroot/read-only startup, private readiness200/public diagnostics404, new routes default-off404 and missing/unverified-provider/export-key fail-closed checks passed. Native includes49 real Linux watchdog/image checks within the native integration case.

Matched image scan: detected Java/HIGH/CRITICAL0; remaining severity counts {'MEDIUM': 25, 'LOW': 4}. Cached database dates/Ubuntu and manually built ImageMagick limitations remain as in [previous artifact evidence](../catalogue/merchandising.md#verification); this is no fresh-advisory claim. Java145/native13 licensed components verified. Source secret scan0. Cleanup checked9 recorded disposable identities; none remain. Full evidence/provenance/smoke records use .tools/locale-self-* and .tools/vs12-locale-self-container-smoke-result.json.

Privacy-case request/read work is next automatically. Physical retention/holds/assisted fulfillment/recovery and actual provider/client/hosted/full-slice/release gates remain unfinished; no provisioning, merge or production deployment performed.
