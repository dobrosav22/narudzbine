# Assisted privacy case request and metadata reads

One record per backend feature: Implementation, Verification. Domain index: [backend](../README.md).

## Implementation

_Originally `BE/PRIVACY_CASE_IMPLEMENTATION.md`: Assisted privacy case request and metadata reads._

2026-10-21 delegated refinement under D-GOV-005 of D-PLAN-018, DESIGN_SPEC section10 and the three existing privacy-case contracts. Prepared during preceding frozen verification; installed after that batch passed, with this selection recorded before dependent code. Backend/infrastructure only.

Current own organization owner/admin can request EXPORT or REDACTION and read its case metadata. Named current platform administrators may inspect metadata across countries, including suspended/closed organizations, with an actual-actor metadata access audit. Business accounts remain original-organization scoped; staff and platform accounts cannot use business routes, and business accounts cannot use the administrative route. Guard current organization/account/session authority through commit. Cases do not enqueue exports, send notices, redact records or deactivate accounts automatically.

Client UUIDv7 is the natural create identity. Store immutable requester/original organization/country, kind, normalized NFC reason, creation millisecond time and SHA256 of canonical kind/reason. The digest is a stable content identity, independent of signing-key rotation; it is not an authentication credential. A currently authorized original creator with the same id/normalized payload recovers the exact original201 Location/body before seven-day equality; different payload409 IDEMPOTENCY_MISMATCH, a different creator or scope404, at/after expiry409 REPLAY_EXPIRED with authorized resourceId. Other current own-org owner/admin may GET metadata but cannot take over creation replay. Never accept Idempotency-Key here. Original JSON preserves the initial signed revision through signing-key rotation. Lifetime ID/scope/digest tombstones remain.

Audit-owned immutable privacy_case contains private request reason; runtime has INSERT and SELECT(id) for PostgreSQL ON CONFLICT identity checks, but no SELECT of reason, UPDATE or DELETE. An explicit metadata view omits requester/reason and supplies only API fields; internal replay identity is separately scoped. An immutable creation receipt allows only one-way clearing of original_response. A bounded SKIP LOCKED cleanup clears expired replay payloads using injected Clock, independently of request success; optional scheduled driver is explicitly enabled by audit.privacy-replay-cleanup.enabled=true, required in environment rollout. No case/history purge. Case insertion, receipt and minimal PRIVACY_CASE_REQUESTED audit commit together. ADMIN_PRIVACY_CASE_READ records actual named administrator and separate target organization/country without reason. Generic audit projections never include the private request text. State is REQUESTED/revision1 in this increment; immutable request evidence is not fabricated REVIEWING/HELD/READY/COMPLETED fulfillment. Later assisted transitions require reviewed tooling/migrations.

Requester verification, X-03 legal/operator inputs, shared-record/hold assessment, field preview, accountable operator approval, restricted redaction role, independently verified R2 deletion-intent/completion ledger and recovery reconciliation remain required before actual export/redaction fulfillment. No runtime resolution/purge endpoint, provider provisioning or production action is authorized by these APIs. Retention/legal-hold implementation beyond this bounded replay cleanup remains unfinished.

Required verification: both countries/types/owner-admin roles; own/foreign/platform/staff boundaries, stable replay/key rotation/equality/tombstones/concurrent response loss, strict UUID/kind/plain text/CSRF; current-role/admin revocation waits; atomic audit/receipt failures; private reason grants/audit/DTO masking; bounded cleanup; immutable source and populated58-to59 migration. Full wrapper/distinct review/new artifact gates precede a verified claim.

### Contract example (synthetic)

For an authenticated own owner/admin, send POST /api/v1/organization/privacy-cases with Content-Type application/json (and browser CSRF when using a cookie):

```json
{
  "id": "019a0000-0000-7000-8000-000000000001",
  "kind": "EXPORT",
  "reason": "Portable copy of our organization's data"
}
```

Retain this same ID and original intent when recovering a lost response.201 Location is /api/v1/organization/privacy-cases/019a0000-0000-7000-8000-000000000001. GET that location with current own owner/admin authority; a named platform administrator uses /api/v1/admin/privacy-cases/019a0000-0000-7000-8000-000000000001. Responses contain only id, revision, kind, organizationId, state and createdAt. The revision is opaque; never construct it. Initial state is REQUESTED, which does not mean an export exists or redaction occurred. Examples are synthetic contract usage, not an actual customer request or provider fulfillment.

## Verification

_Originally `BE/PRIVACY_CASE_VERIFICATION.md`: Assisted privacy-case intake verification._

2026-10-21. [Refinement](#implementation), [grants](../../../BE/audit/privacy-case-grants.sql), [handoff](../../frontend/backend-handoff.md). Existing requestPrivacyCase/getPrivacyCase/adminGetPrivacyCase locally verified over schema59;209 configured/209 planned operations. API coverage is not whole-project, full-slice or release completion. Backend/infrastructure only.

Final .tools/privacy-cases-final-verify.log: BUILD SUCCESS,1213 passed (155 unit/1058 PostgreSQL/native integration), zero failures/errors/skips. Integration classes: AdministrativeDirectoryMigrationIT1/AuditReadMigrationIT1/OrganizationClosureMigrationIT1/OrganizationStateMigrationIT1/PrivacyCaseMigrationIT1/SupportMigrationIT1/FoundationIT48/AuthHttpIT927/DeviceMigrationIT1/IdentityBoundariesIT11/PasswordLoginIT15/SessionServiceIT22/MediaProcessingIT24/NativeProcessingIT1/InboxMigrationIT1/ExternalDeliveryMigrationIT1/ExportMigrationIT1. Focus3 passed155 unit/14 PostgreSQL checks:13 new HTTP cases plus populated58 migration. Focus1 caught missing PostgreSQL SELECT(id) privilege for ON CONFLICT; corrected only that ID-column grant. Focus2 passed all preceding13 checks, and focus3 added a real locked-receipt SKIP LOCKED test. Private reason SELECT remains denied.

Verified both countries/types and owner/admin requests, safe six-field own/actual-platform metadata, immutable creator and original scope, shared same-org owner/admin GET versus creator-only replay, staff/foreign/platform boundaries, normalized natural replay and signing-key rotation, original response snapshot, different-payload conflict, seven-day equality and retained tombstone, concurrent duplicate/discarded-response retry with one request/receipt/audit, strict inputs/queries/CSRF/CORS, audit/receipt-failure rollback, actual role/admin revocation waits, named-admin metadata access while target suspended/closed, private-reason DTO/audit/grant masking, append-only source/receipt guards, bounded100 cleanup and real locked-row skip/retry. Populated58 upgrade/repeated migration preserves prior identities/support/audit history and creates empty new case tables. Existing full migration/identity/session/order/stock/provider/native checks passed.

Distinct primary review .tools/privacy-cases-review.md checked actual session/membership scope, current role/locks through commit, original replay identity/expiry/key independence, safe metadata view/private reason and redacted diagnostics, atomic actual-actor audit, narrow runtime grants/immutable triggers, bounded one-way compaction and explicit no-fulfillment boundary. No platform impersonation, commercial export/redaction, ordinary resolve/purge endpoint, account movement or provider message was introduced. Initial case state remains REQUESTED/revision1. Optional cleanup scheduling must be explicitly enabled in reviewed deployment; local explicit-sweep tests do not establish hosted scheduling or whole-platform retention.

Artifact narudzbine-backend:vs12-privacy-cases: sha256:e5d702d458d3b62aeb279b0219743a8327d478682b56cd96c86a1cd79434f726; JAR SHA256 c92628f9d0c178e3c3f65534c15270dd557e6ab69b8d70ae5914d5b134635d4b. All825 application classes/64 source resources match packaged/tested content; native fixture/production binary and class match. 517 frozen inputs unchanged. Packaged controlled migration59, nonroot/read-only startup, private readiness200/public diagnostics404, default-off new and prior business routes, unconfigured export-key/missing or unverified-provider fail-closed checks passed. Native includes49 actual Linux image/watchdog checks within its integration case. Exact marker readiness means the old58 application cannot simply restart on59; a future approved release needs a compatible rollback artifact or fix forward.

Matched image scan: detected Java/HIGH/CRITICAL0; severity counts {'MEDIUM': 25, 'LOW': 4}. Cached advisory dates/Ubuntu and manually built ImageMagick limitations remain as in [prior artifact evidence](../catalogue/merchandising.md#verification); no fresh-advisory or zero-vulnerability claim. Java145/native13 licensed components verified. Source secret scan0. Cleanup checked17 recorded disposable identities; none remain. Evidence/provenance/smoke records use .tools/privacy-cases-* and .tools/vs12-privacy-cases-container-smoke-result.json.

D-PLAN-018/R-PLAN-018 intake/replay/metadata aspects are exercised. Legal holds, assisted JSON export/redaction fulfillment, restricted operator tools, independent deletion intent/completion/recovery ledger, wider physical retention and actual X/G provider/operator/client/hosted/recovery/full-slice/release gates remain unfinished. No legal compliance, provider provisioning, PR merge or production deployment is claimed. Next discovery .tools/privacy-follow-up.md preserves those boundaries.
