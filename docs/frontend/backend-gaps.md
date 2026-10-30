# Frontend ↔ backend gaps

Written for: the backend owner deciding what to add next, and anyone continuing the frontend.

The web and mobile apps were moved from mocks onto the real backend (D-GOV-007, 2026-10-24/26). This document lists every gap found while doing that: what the UI needs but the backend does not offer, contract details that forced a workaround, and what could not be verified locally. Each entry says how the UI copes today. Per-area detail (wired operations, live checks, resolved ambiguities) is in [gaps/](area-notes/).

Status words: **Fixed** = changed in this repository with a test. **Open** = not changed; the UI works around it as described. Nothing here is a claim about production readiness.

## 1. Fixed during integration

| # | Gap | Resolution |
|---|-----|------------|
| F-1 | CORS was registered route by route and missed browser routes (`/me/notifications*`, `/me/notification-preferences`, `/me/devices*`, `/organization/closure`, `/organization/audit`, `/reports/**`, `/exports/**`, `/admin/organizations/**`, `/admin/summary`, `/admin/support*`, `/admin/audit`, `/admin/recovery-cases/**`, `/recovery-cases/**`). A web app on its own origin could not call any of them. | Registered in `AuthHttpConfiguration`. New `AuthHttpIT.everyBrowserRouteAnswersAllowedOriginPreflight` walks every mapped `/api/v1` route and fails on any without an allowed-origin preflight; it fails without the fix and passes with it. |
| F-2 | The synthetic developer backend allowed only `https://app.example`, a random port and one hour, so no browser could use it. | Test-classpath-only, loopback-only inputs `LOCAL_SYNTHETIC_BROWSER_ORIGINS`, `LOCAL_SYNTHETIC_API_PORT`, `LOCAL_SYNTHETIC_SERVE_SECONDS` (≤ 8 h); the production origin policy still validates them ([BE/operations/README.md](../operations/local-tooling.md)). |

## 2. Open — correctness and safety (decide first)

| # | Gap | UI today |
|---|-----|----------|
| B-1 | **One order review can become several orders.** `purchase_order.review_id` is not unique: the same `reviewId` submitted with a second Idempotency-Key created a second order (observed live). The spec makes drafts single-use but is silent on direct review receipts. Decide: consume a receipt on first successful submission, or document repeated use as intended. | One key per receipt, stored with the pending submission and reused only for retries; cart cleared on success. Two devices holding the same receipt can still double-order. |
| B-2 | **Invitation links do not say what they are for.** Setup (vendor/buyer), member and trading invitations share `/#/invitation?token=…`; no public read reveals the purpose, organization type or country (setup must send the invited country). | The invitee chooses "new company / join team / connect existing buyer"; a wrong choice costs a `TOKEN_INVALID` round trip; country is picked and validated by the backend (422). Needed: a capability-bound token inspection read, or purpose-specific link paths. |
| B-3 | **Recovery acceptance link has no case id**, but `POST /recovery-cases/{caseId}/acceptance` needs it and there is no business read of own cases. | `/recovery` asks for the case reference the operator gives out of band. |
| B-4 | **Platform admins cannot list or read relationships**, yet `adminDisconnect` needs a relationship id and revision. | The console calls `POST /admin/connections` on an already-active pair to obtain it (a no-op for connected pairs, but it *connects* unconnected ones); the UI warns the operator. Needed: admin relationship list/read. |
| B-5 | **Staff submission restriction has no dedicated problem code** (generic 403 `FORBIDDEN`). | Pre-checked from `organization.staffSubmissionRestricted` + role; a 403 on submit is explained as the restriction and the session refreshed. |

## 3. Open — missing lists and reads (workarounds cost extra requests)

| # | Gap | UI today |
|---|-----|----------|
| L-1 | **No partner names on relationships** (`Relationship` has ids only). Needed by order filters, buyers/vendors lists, the vendor switcher and drafts. | One `GET /partners/{id}` per partner, cached 5 min (N+1). Lists can't sort/search by partner name. |
| L-2 | **No price/stock summary on the vendor product list.** | One pricing read (and one stock read on the inventory page) per row, 25 per page. |
| L-3 | **Agreed prices carry only `productId`, and can only be read per relationship.** | Names read per product; the product editor reads every relationship's agreement list and filters. |
| L-4 | **No batch price resolution for a cart.** | One `GET …/offers/{productId}?quantity=` per cart line. |
| L-5 | **No list of own email-change requests, privacy cases, exports, recovery cases or setup invitations (admin).** | Ids are remembered client-side (email change, exports — lost on reload), or found through audit rows (privacy cases, transfers, recovery, setup invitations); recovery/admin invitations also open by id. |
| L-6 | **Ownership-transfer recipients are not notified and can't list offers.** STAFF can't read audit. | The owner shares the transfer reference; the recipient looks it up. |
| L-7 | **No unread counts** (notifications, order messages). | Badge counts the first page of unread notifications ("99+"); open threads poll every 60 s. |
| L-8 | **Order snapshots lack delivery location name/id; no `deliveryLocationId` filter; no "replaced by" link; no relationship state.** | Address line shown instead of location name; "Order a replacement" may be offered for an already-replaced order (backend 409); read-only thread inferred from the partner read. |
| L-9 | **Incoming trading invitations show no inviting vendor; a vendor cannot invite an existing, never-connected buyer.** | Buyer sees "N invitations sent to <email>"; the vendor's only path for an existing buyer business is an admin connection. |
| L-10 | **Plan requests have no vendor filter/name; audit rows have no actor/resource names; support order lookup is by id only.** | Names resolved per row; audit shows ids with links to console pages. |
| L-11 | **Reports have no vendor (buyer side) or location filter; cursor lists have no totals; no low-stock list or threshold.** | Buyer stats span all vendors; "awaiting acceptance" shows "100+"; the dashboard shows only whether tracking is on. |
| L-12 | **Vendor product list: no featured filter, no featured order, no "not archived" filter; no taxonomy usage counts.** | Featured screen filters client-side over all products; "All statuses" includes archived; deletion conflicts are explained after `RESOURCE_REFERENCED`. |
| L-13 | **Offers filter on one tag and one category.** | Single-select filters. |
| L-14 | **Invitation metadata has no invited role; no first plan assignment for a vendor without a plan (`PLAN_REQUIRED`).** | Role not shown; "No plan assigned" without an action (setup always pins a plan). |

## 4. Open — contract precision

- Review quantity errors use `INVALID_VALUE` instead of `QUANTITY_INVALID`; the UI validates minimum/step locally with the backend rule (`q ≥ min` and `(q − min) % step = 0`).
- `POST /invitations/buyers` validation errors are not field-addressed (`path: ""`); shown above the form.
- A duplicate SKU returns `SKU_RESERVED` (not `DUPLICATE_SKU`); the shared text covers both cases.
- Handoff text says `DELETE /organization/ownership-transfers/{id}` has no query; OpenAPI requires `expectedRevision`. The client follows OpenAPI.
- Agreed-price confirmation after reconnection is vendor-only (buyers get 404), although a buyer-side reconfirmation was expected; the vendor's buyer detail holds the review/confirm step and the buyer sees a notice.

Found by the 2026-10-30 [QA exploration](qa-findings.md):

- **C-QA-1. No maximum order quantity** ([QA-016](qa-findings.md#qa-016--no-upper-limit-on-order-quantity)). A review of 1,000,000,000 kg (18,500,000,007.00 KM) is priced and ready to submit. R-API-011 leaves safe integer/value maxima open. The UI has no limit either; this needs a product decision.
- **C-QA-2. The local harness can't follow invitation links** ([QA-030](qa-findings.md#qa-030--no-local-way-to-accept-invitations-so-staff-and-admin-roles-cant-be-tested)). Email delivery is off and nothing records the links, so staff and admin members, the staff submission restriction, setup and an empty organization can't be exercised locally. One option: the synthetic email stand-in keeps the latest links for the loopback-only harness.
- **C-QA-3. Wrong problem title on catalogue validation** ([QA-031](qa-findings.md#qa-031--catalogue-validation-errors-carry-an-authentication-title)). `POST /catalogue/products` with an over-long SKU returns 422 `VALIDATION_FAILED` titled "Authentication request could not be completed". The apps show text by `code`, so users don't see it.

## 5. Deployment and environment prerequisites

| # | Item | Impact |
|---|------|--------|
| D-1 | Browser transport needs https web and API origins on the **same site** (schemeful SameSite=Lax `__Host-` cookies), with the web origin in `identity.http.origins`. `/auth/bootstrap` and `/auth/csrf` need an Origin header, which browsers omit on same-origin GETs, so the web calls the API cross-origin. | Real domains are X-02. Apps read `NEXT_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_API_BASE_URL`; `eas.json` carries `.invalid` placeholders. |
| D-2 | Provider conformance (FusionAuth, Google/Apple, Resend, FCM/APNs, R2) is an external gate (G-02/X). | External login and push are wired to the contract but not accepted against real providers. |
| D-3 | **Request budgets** (`LoginThrottle`): 120 API reads per minute per account; 30 logins per 15 min per account and per source address; 30 pre-auth bootstraps per 15 min per source. 429 carries `Retry-After`. | The apps never sign out on 429/503 (only 401 ends a session), retry reads after `Retry-After`, and never auto-retry mutations. The per-row reads of L-1/L-2/L-3 count against the 120/min budget, so a few heavy pages in a row can exhaust it — the strongest reason to add the list-level names/prices. Users behind one NAT share the per-source login budget. |
| D-4 | **Report reads are serialized per organization**: each report holds the organization authorization lock while computing, so parallel report reads get 503 after the 2 s lock wait (verified: 1 of 3 parallel calls failed; sequential calls all succeed). | Both apps queue report reads one at a time (`oneReportAtATime`). Two people of one organization opening stats at the same moment can still see a retried 503. |

## 6. Not verifiable locally (implemented to the contract only)

- **Email delivery is off:** setup, member/trading invitation, password reset, email-change and recovery links were exercised only up to the request and with invalid tokens.
- **Image processing does not run:** uploads stay `QUEUED`, so READY → attach → display is untested.
- **Exports stay `QUEUED`:** CSV download is untested.
- **Stock tracking was not switched on** (it would change ordering for the shared fixtures): reconciliation was exercised up to `REVIEW_INCOMPLETE`; stock shortages and `TERMS_CHANGED` are covered by unit tests only.
- **One platform admin, no evidence adapter:** the two-administrator recovery review and staff reactivation were not executed.
- **Not exercised to protect shared fixtures:** password change, completed email change, ownership transfer, member deactivation, organization closure, revoke-all sessions, identity unlink, real disconnect/reconnect.

## 7. Frontend-owned gaps

- **No Bosnian (`bs-Latn-BA`) UI resources.** Accounts with that language see the Serbian Latin UI; translation needs a translator, none was invented.
- **No push registration in the clients.** Device list/remove works; registering a token needs the FCM web SDK and `expo-notifications` with real Firebase/APNs projects (X/G-04).
- **Web-only for now:** promotion create/edit, CSV import, CSV report exports (no file-sharing library on mobile), organization setup, closure, audit, privacy cases, recovery acceptance and Google/Apple linking.

## 8. Operations intentionally without UI

- Privacy-case operator tooling stays an assisted operator procedure (separately default-off, qualified operator only, external evidence references; OPERATIONS_RUNBOOK). The console offers only the audited metadata read `adminGetPrivacyCase`. Without UI: `reviewPrivatePrivacyCase`, `activateRetentionHold`, `getRetentionHold`, `releaseRetentionHold`, `approvePortableExport`, `getLatestAdministrativePortableExport`, `getAdministrativePortableExport`, `previewPrivacyRedaction`, `approveScopedPrivacyRedaction`, `getScopedPrivacyRedaction`, `cancelScopedPrivacyRedaction`, `recordPrivacyCaseDisposition`, `readPrivacyCaseDisposition`.
- `completeExternalCallback` / `completeExternalFormCallback` (provider → backend redirects) and `receiveEmailWebhook` (provider → backend).
- `GET /locales` (the UI uses the fixed launch roster), `PricingUpdate.deactivateProduct: true` (the message tells the vendor to deactivate first).
