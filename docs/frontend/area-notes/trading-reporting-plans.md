# Gaps — trading relationships, reporting, plans (agent D2)

Scope: vendor Buyers and buyer Vendors (relationships, partner details, buyer invitations, agreed-price
reconfirmation), Stats (reports + CSV exports), vendor dashboard, vendor plan and plan-change requests.
Live checks ran against the local synthetic backend on 2026-10-26 (RS vendor/buyer owners).

## Backend capabilities missing or limiting the UI

1. **No partner name on relationship lists** (`listRelationships`, `Relationship` schema). A
   relationship carries only `vendorId`/`buyerId`; every list row calls `GET /partners/{organizationId}`
   (N+1, at most 25 per page, cached 5 min). A `partnerDisplayName` on `Relationship` or a batch partner
   read would remove this. Lists cannot be sorted or searched by partner name for the same reason.
2. **Agreed prices are vendor-only** (`listAgreedPrices`, `confirmAgreedPrices`; FRONTEND_HANDOFF "Agreed
   buyer prices": "Buyers/platform accounts cannot use these routes" — verified: buyer gets 404). The task
   asked for the reconfirmation on the buyer's vendor detail; it is implemented on the **vendor's** buyer
   detail instead. The buyer only sees `agreedPriceConfirmationRequired` as an informational notice.
3. **Agreed prices carry only `productId`.** Product names/SKUs are read one by one with
   `GET /catalogue/products/{id}` (vendor side). A name/SKU on `AgreedPrice` would avoid N+1 reads.
4. **No way to invite an existing, never-connected buyer.** `POST /invitations/buyers` with an existing
   `buyerOrganizationId` needs an organization id the vendor can only know from a former relationship
   (no discovery, by design). The UI therefore offers: "invite a new buyer business" (setup invitation,
   `buyerOrganizationId: null`) on the list, and "reconnect" (TRADING invitation) on a disconnected
   buyer's detail. A vendor whose new customer already uses Narudžbine as a buyer has no path except an
   admin connection (`POST /admin/connections`).
5. **Incoming TRADING invitations show no vendor.** `GET /invitations` for a buyer owner/admin returns
   `targetOrganizationId` (the buyer itself) but not the inviting vendor, so the buyer's Vendors page can
   only say "N invitations sent to <email>; open the emailed link". Acceptance itself is token-only
   (`acceptTradingInvitation`, agent A's public flow).
6. **No list of a requester's exports** (`requestExport`/`getExport` only). Export jobs are tracked in
   page state; leaving the page loses the handle (the file is still downloadable by id for 24 h, but the
   UI cannot find it again).
7. **No low-stock list or alert threshold.** The dashboard shows only whether stock tracking is on
   (`GET /inventory/tracking`); per-product stock needs one `GET /inventory/products/{id}` per product.
   The old mock "low stock" card was removed rather than invented.
8. **Cursor order lists have no total.** "Awaiting acceptance" on the dashboard counts up to 100
   (`GET /orders?state=AWAITING_ACCEPTANCE&size=100`) and shows "100+" when `nextCursor` is set.
9. **Reports have no vendor (buyer side) or location filter** (`getReportSummary`, `getProductReport`).
   The buyer's stats are across all of its vendors; the old per-vendor and per-location filters were
   removed. Buyer product rows are not linked (they can belong to any vendor).
10. **Validation errors for `POST /invitations/buyers` are not field-addressed**: an invalid email
    returned `422 VALIDATION_FAILED` with `errors[0].path = ""` (whole body), so the message is shown
    above the form instead of under the email field. The UI also maps `/recipientEmail` if the backend
    starts sending it.

## Contract ambiguities resolved

- **Plan display:** `PlanRevision` has only `code` + `revision` + limits; names are UI translations of
  `STARTER/GROWTH/PRO`, revision shown only when > 1. No prices are shown or inferred (D-PLAN-003); the
  mock tier price/billing concept and its `planText` namespace were removed.
- **Plan list order:** `GET /plans` returns codes alphabetically; the UI sorts by product, then buyer limit.
- **Plan requests:** staff get 403 on `GET /organization/plan-requests`, so the request section is
  hidden for STAFF (read-only plan + usage remains). One pending request at a time; withdraw uses the
  request's `revision`. Requesting a plan smaller than current usage is allowed but warned about
  (approval rechecks usage).
- **Buyer limit:** pending invitations reserve no capacity (handoff), so inviting is never blocked by the
  UI at the cap; a notice explains the cap is checked on acceptance, and PLAN_LIMIT_EXCEEDED /
  PLAN_REQUIRED from the backend show the plan link.
- **Agreed-price confirmation:** all pages are read and must carry the same `pricingRevision` and
  `relationshipRevision` (re-read up to 3 times) before the tokens are used, so a change between pages
  cannot be confirmed unseen. Web lets the vendor deselect products (partial review keeps them dormant);
  mobile confirms all pending ones. 409 REVISION_CONFLICT refetches and asks for a new review.
- **Disconnect:** reason required (≤ 1000), current revision; 409 REVISION_CONFLICT keeps the typed
  reason. A buyer disconnecting its active vendor clears the active-vendor context.
- **Resend:** one UUIDv4 Idempotency-Key per resend intent, reused only after an uncertain outcome.
- **Exports:** client UUIDv7 per intent (no Idempotency-Key); uncertain POST outcomes offer a retry
  with the same id and body. Polling backoff 2/4/8/15 s while QUEUED. Buyers are offered ORDERS and
  REPORT_PRODUCTS only (REPORT_BUYERS returns 404 for buyers — verified).
- **Report ranges:** presets (7/30/90 days per day; 12 months, this year, 5 years per month) end at the
  country-local today; web also offers a validated custom range (≤ 60 calendar months, grouped per day
  up to 92 days, else per month). The average order value is derived client-side with exact decimal
  arithmetic (half-up), labelled like the other net amounts.

## Operations intentionally without UI

- `getInvitation` (lists carry the same metadata), `acceptTradingInvitation` (agent A's public token flow).
- `setAgreedPrice` / `removeAgreedPrice` (agent B, product editor); the buyer detail links to products.
- Admin plan/relationship operations (agent E).
- Mobile CSV exports: the app has no file-sharing dependency (`expo-sharing`/`expo-file-system` are not
  installed); mobile Stats says exports are on the web.

## Local-test limitations

- Exports stayed `QUEUED` for 20+ s on the local backend (worker/artifact key not active), so
  `GET /exports/{id}/content` returned 409 INVALID_STATE; the download path (blob → file) is
  implemented to the contract but not exercised end to end.
- Invitation email is off locally: setup/TRADING links cannot be followed; invite (201), keyed resend
  (200, replay 200 with the same key), list and revoke (204) were exercised. Disconnect was exercised
  only with a stale revision (409 REVISION_CONFLICT, no effect) to keep the seeded relationships;
  reconnection confirmation was exercised with the current snapshot on an already-confirmed agreement
  (200, unchanged). A real disconnected/reconnected pair was not available.
- Plan request was created and withdrawn (201 → 204 → WITHDRAWN); no plan was changed.

## Notes for other areas

- Agent A: `features/org-admin/plan-panel.tsx` and `PlanSettingsPage` in `org-admin/pages.tsx` are no
  longer used — `/vendor/settings/plan` renders `features/subscription/plan-screen.tsx`. The
  `settings.plan` keys can go. `/buyer/vendors` (web) and `buyer/vendors` (mobile) need nav entries. The
  `/vendor/settings/**` pages may want the settings section nav via a layout; the plan page renders its
  own heading. Removed namespaces: `planText`, `periods`, `mBuyers` (the old register screen and mobile
  team screen referenced them).
- Agent B: `PlanLimitNotice` (web and mobile `features/subscription/plan-limit.tsx`) now takes
  `{ limit: 'products' | 'buyers', plan?: VendorPlan | null }`; core exports `planAtLimit`,
  `planQueries.current()` and `planKeys`. Old core `stats/` is gone (`merchandising/promotions.test.ts`
  still imports it).
- Agent D1: dashboard/buyer links use `/vendor/orders?partnerId=…`, `/vendor/orders?state=AWAITING_ACCEPTANCE`
  and `/buyer/orders?partnerId=…` (mobile passes `partnerId` as a route param); the lists currently keep
  filters in component state only.
- The shared test "keys named in shared code and apps exist in English" fails on its `found.length > 100`
  sanity threshold (fewer key literals now that mocks are gone), not on a missing key.
- `apps/web/.next/dev/types/validator.ts` is a stale `next dev` artifact referencing removed routes
  (e.g. `/vendor/buyers/[buyerOrgId]`); it regenerates on the next dev run.

## Core change requests

None required. (Optional: a `formatShortDate` in `format.ts` for chart axis ticks; day ticks currently
show the day-of-month number.)
