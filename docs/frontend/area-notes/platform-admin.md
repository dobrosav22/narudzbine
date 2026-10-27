# Platform administration (agent E) — gaps, decisions and limits

Scope: web admin console under `/admin` (apps/web `features/admin/*`, `app/admin/**` except `layout.tsx`), shared module `packages/core/queries/admin.ts` (+ `admin.test.ts`), i18n namespace `admin` (en + sr-Latn). Mobile has no admin console (agent A shows "admin is web-only").

## Crucial backend gaps

1. **No administrative relationship list or read** (`administration` tag has only `adminConnectOrganizations` and `adminDisconnect`). `adminDisconnect` needs the relationship id **and** its current `revision`, which an administrator cannot read. UI impact: the Connections tab cannot show an organization's partners. Workaround in the UI (documented to the operator): `POST /admin/connections` for an *already active* pair returns the existing relationship unchanged without effects (contract: "An already-active pair returns its unchanged relationship without additional effects"; verified live: 201 with original `updatedAt`), which is then shown with a Disconnect action. If the pair is *not* connected the same call connects it, so this is not a pure lookup. Needed: `GET /admin/organizations/{organizationId}/relationships` (paged, state filter) or `GET /admin/relationships/{relationshipId}`.
2. **No administrative list of sent setup invitations.** `listInvitations` is business-scoped (404 for the platform admin; verified) and setup invitations are "separately sender scoped". UI impact: the console can only show invitations created in the current browser tab (memory only) plus open-by-id (ids come from `SETUP_INVITED` audit rows, which the audit screen links). An operator cannot see pending/failed setup invitations to resend them after a reload. Needed: `GET /admin/setup-invitations` (sender-scoped or platform-wide, state filter).
3. **No first-plan assignment for a vendor without a plan.** `adminGetVendorPlan` returns 409 `PLAN_REQUIRED` and `adminAssignPlan` requires `expectedRevision` from that read. UI shows "No plan assigned" with no action. Setup always pins a plan, so this only matters for anomalies.
4. **Plan requests list has no vendor filter / vendor name.** `GET /admin/plan-requests` returns `vendorId` only; the UI resolves names with one `adminGetOrganization` per distinct vendor (≤25 per page) and the current plan with one `adminGetVendorPlan` per pending row. Acceptable at pilot scale; a `vendorId` filter and an embedded vendor display name would remove the N+1 reads and allow a per-vendor history on the organization page.
5. **Audit metadata cannot be resolved to names.** `AuditEvent` has `actorAccountId`/`resourceId` but no actor display name, organization or country, and there is no admin account read. UI shows ids (with copy) and "You" for the signed-in admin; known resource families link to console pages (`RECOVERY_*` → recovery case, `PRIVACY_CASE*` → privacy case, `SETUP_*` → invitation, `ADMIN_ORGANIZATION_*` → organization). Action filter is free text (no published action catalogue; unknown well-formed actions return an empty page by contract).
6. **Recovery cases cannot be listed.** Only create/get/review exist; there is no list of open cases awaiting the second administrator's review. UI: cases are opened from the success redirect, from audit `RECOVERY_*` rows or by id. Also `Recovery` has no creator field, so the UI cannot tell the reviewer in advance that they created the case (backend rejects; error shown).
7. **Support order lookup is by id only.** There is no support-scoped order list for an organization, so the operator needs the order id from the customer (or the report). Report buckets do not carry order ids.
8. **Agreed prices carry no product name** (`AgreedPrice.productId` only); the support view shows product ids with a hint to match the Products tab.

## Contract ambiguities resolved

- `adminListPlanRequests.state` is `string(maxLength 40)`; verified live that `PENDING|APPROVED|REJECTED|WITHDRAWN|SUPERSEDED` are accepted and anything else is 422. The UI offers exactly these (`PLAN_REQUEST_STATES`).
- `adminInviteOrganization` returns 201 (new) or 200 (identical pending invitation, no mail, no expiry change); the core function exposes `duplicate` from the HTTP status and the UI tells the operator nothing was resent.
- Support reads: each successful read commits audit evidence, so support queries never refetch in the background (`staleTime: Infinity`, no focus/reconnect refetch, no retry) and lists/expansions load only on an explicit operator action. Contexts are kept in memory for the tab only, never persisted or extended; a 404 from any support read is presented as "expired or outside this organization" with a "start a new support view" action.
- Disconnection reason is shared with both parties (contract: "reason is shared only through authorized application reads"); plan-request approval/rejection reasons are vendor-visible. All other admin reasons are labelled private.
- Organization correction is a complete replacement: address country and coordinates are carried over unchanged; blank optional fields become explicit `null`.
- Close requires typing the organization's display name; suspend/reactivate/close/correction/staff/plan/request writes keep the reason input on failure and refetch on `REVISION_CONFLICT` so the operator re-confirms against current data (never a silent resend).
- All admin writes are wrapped in `useGuarded()`; recovery create/review require <5-minute proof per contract.

## Operations intentionally left without UI

Privacy-case operator tooling stays an **assisted operator procedure** (decision: these routes are separately default-off, restricted to an explicitly qualified privacy operator, need case references from the external evidence process and are described as "not an ordinary business/client workflow" in FRONTEND_HANDOFF/OPERATIONS_RUNBOOK). The console provides only the safe, audited metadata read `adminGetPrivacyCase` at `/admin/privacy-cases/[caseId]` with a note pointing to the runbook. Without UI:
`reviewPrivatePrivacyCase`, `activateRetentionHold`, `getRetentionHold`, `releaseRetentionHold`, `approvePortableExport`, `getLatestAdministrativePortableExport`, `getAdministrativePortableExport`, `previewPrivacyRedaction`, `approveScopedPrivacyRedaction`, `getScopedPrivacyRedaction`, `cancelScopedPrivacyRedaction`, `recordPrivacyCaseDisposition`, `readPrivacyCaseDisposition`.

Also not offered: business-own routes that platform admins cannot use (`/organization/**`), and `POST /recovery-cases/{caseId}/acceptance` (accepted by the target person, agent A's public flow).

## Wired operations (all verified live against the synthetic backend unless noted)

Reads: `adminGetSummary`, `adminListOrganizations` (type/country/state/q/paging/includeTotal), `adminGetOrganization`, `adminListMembers` (state/role/paging), `adminGetVendorPlan`, `listPlans` (includeRetired), `adminListPlanRequests` (each state), `adminListAudit` (organizationId/action/cursor), `getInvitation`, `adminGetPrivacyCase`, `getRecoveryCase` (404 probe only), `createSupportAccess` + all eight support reads (`adminReadReport`, `adminReadOrder`, `adminReadMessages`, `adminReadProducts`, `adminReadPricing`, `adminReadStock`, `adminReadPromotions`, `adminReadAgreedPrices`) on the seeded RS vendor.
Safe writes executed: `adminInviteOrganization` (synthetic `admin-ui-check+N@example.com`, 201 then duplicate 200), `resendInvitation` (Idempotency-Key, 200), `revokeInvitation` (204 → REVOKED), `adminConnectOrganizations` on the already-active seeded pair (no-op 201), `adminRejectPlanRequest` on a request the RS vendor created for this check (vendor plan unchanged).
Shape/validation probes only (never applied to seeded fixtures): `adminSuspendOrganization` (stale revision → 409 `REVISION_CONFLICT` with `currentRevision`; missing reason → 422), `adminReactivateOrganization`, `adminCloseOrganization`, `adminDeactivateStaff`, `adminApprovePlanRequest`, `adminDisconnect`, `adminCorrectOrganization`, `adminAssignPlan` (422 field paths `/reason`, `/registeredAddress`, `/planRevisionId`), `createRecoveryCase` (unknown organization → 404). Not executed: `adminReactivateStaff`, `reviewRecoveryCase` (needs a real case and a second administrator; local harness has one admin and no evidence adapter).

## Local-test limitations

- Email delivery is off: invitation `deliveryState` stays `QUEUED`; setup completion cannot be followed end to end, so no new organization could be created and connected.
- Only one platform administrator exists locally, so the two-administrator recovery review cannot be exercised; whether recovery HTTP is enabled locally was only inferred (validation 422 and 404 for unknown targets).
- No UI run (`next dev` not allowed in this stage); screens are verified by typecheck, lint and live API calls of the same requests.
- `.next/dev/types/validator.ts` still references the deleted `/admin/vendors/**` and `/admin/buyers/**` routes; it is generated by the dev server and regenerates on the next `next dev`.

## Core change requests

- `problems.codes` has no text for `EVIDENCE_INCOMPLETE` (recovery review) — the console maps it locally; a shared message would help other surfaces.
