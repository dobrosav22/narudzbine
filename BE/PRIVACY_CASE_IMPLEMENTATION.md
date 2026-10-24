# Assisted privacy case request and metadata reads

2026-10-21 delegated refinement under D-GOV-005 of D-PLAN-018, DESIGN_SPEC section10 and the three existing privacy-case contracts. Prepared during preceding frozen verification; installed after that batch passed, with this selection recorded before dependent code. Backend/infrastructure only.

Current own organization owner/admin can request EXPORT or REDACTION and read its case metadata. Named current platform administrators may inspect metadata across countries, including suspended/closed organizations, with an actual-actor metadata access audit. Business accounts remain original-organization scoped; staff and platform accounts cannot use business routes, and business accounts cannot use the administrative route. Guard current organization/account/session authority through commit. Cases do not enqueue exports, send notices, redact records or deactivate accounts automatically.

Client UUIDv7 is the natural create identity. Store immutable requester/original organization/country, kind, normalized NFC reason, creation millisecond time and SHA256 of canonical kind/reason. The digest is a stable content identity, independent of signing-key rotation; it is not an authentication credential. A currently authorized original creator with the same id/normalized payload recovers the exact original201 Location/body before seven-day equality; different payload409 IDEMPOTENCY_MISMATCH, a different creator or scope404, at/after expiry409 REPLAY_EXPIRED with authorized resourceId. Other current own-org owner/admin may GET metadata but cannot take over creation replay. Never accept Idempotency-Key here. Original JSON preserves the initial signed revision through signing-key rotation. Lifetime ID/scope/digest tombstones remain.

Audit-owned immutable privacy_case contains private request reason; runtime has INSERT and SELECT(id) for PostgreSQL ON CONFLICT identity checks, but no SELECT of reason, UPDATE or DELETE. An explicit metadata view omits requester/reason and supplies only API fields; internal replay identity is separately scoped. An immutable creation receipt allows only one-way clearing of original_response. A bounded SKIP LOCKED cleanup clears expired replay payloads using injected Clock, independently of request success; optional scheduled driver is explicitly enabled by audit.privacy-replay-cleanup.enabled=true, required in environment rollout. No case/history purge. Case insertion, receipt and minimal PRIVACY_CASE_REQUESTED audit commit together. ADMIN_PRIVACY_CASE_READ records actual named administrator and separate target organization/country without reason. Generic audit projections never include the private request text. State is REQUESTED/revision1 in this increment; immutable request evidence is not fabricated REVIEWING/HELD/READY/COMPLETED fulfillment. Later assisted transitions require reviewed tooling/migrations.

Requester verification, X-03 legal/operator inputs, shared-record/hold assessment, field preview, accountable operator approval, restricted redaction role, independently verified R2 deletion-intent/completion ledger and recovery reconciliation remain required before actual export/redaction fulfillment. No runtime resolution/purge endpoint, provider provisioning or production action is authorized by these APIs. Retention/legal-hold implementation beyond this bounded replay cleanup remains unfinished.

Required verification: both countries/types/owner-admin roles; own/foreign/platform/staff boundaries, stable replay/key rotation/equality/tombstones/concurrent response loss, strict UUID/kind/plain text/CSRF; current-role/admin revocation waits; atomic audit/receipt failures; private reason grants/audit/DTO masking; bounded cleanup; immutable source and populated58-to59 migration. Full wrapper/distinct review/new artifact gates precede a verified claim.

## Contract example (synthetic)

For an authenticated own owner/admin, send POST /api/v1/organization/privacy-cases with Content-Type application/json (and browser CSRF when using a cookie):

```json
{
  "id": "019a0000-0000-7000-8000-000000000001",
  "kind": "EXPORT",
  "reason": "Portable copy of our organization's data"
}
```

Retain this same ID and original intent when recovering a lost response.201 Location is /api/v1/organization/privacy-cases/019a0000-0000-7000-8000-000000000001. GET that location with current own owner/admin authority; a named platform administrator uses /api/v1/admin/privacy-cases/019a0000-0000-7000-8000-000000000001. Responses contain only id, revision, kind, organizationId, state and createdAt. The revision is opaque; never construct it. Initial state is REQUESTED, which does not mean an export exists or redaction occurred. Examples are synthetic contract usage, not an actual customer request or provider fulfillment.
