# Buyer ordering (agent C) — gaps, decisions and limitations

Scope: buyer vendor context/switcher, offers browse and product detail, shared favorites, local cart,
shared drafts, checkout (review → submit), reorder helper. Web + mobile + `packages/core`
(`queries/{offers,buyerWorkspace,checkout,buyer}.ts`, `cart/{store,quantity,money,estimate}.ts`).

## Backend gaps / observations (crucial first)

1. **An order review receipt can be submitted more than once (duplicate-order risk).** Observed live
   2026-10-25: `POST /orders {reviewId}` with Idempotency-Key K1 created order 2026/8; the same
   `reviewId` with a different key K2 created a *second* order 2026/9 (both `201`). The contract
   describes the receipt as "never an order hold" and only the key de-duplicates. The UI mitigates
   this (one key per receipt, persisted with the pending submission in the cart, cart emptied on
   success), but two devices/tabs holding the same receipt can still double-order. Ask: make a
   direct receipt single-use (consume on first successful submission) or document it as intended.
   Ref: submitOrder, FRONTEND_HANDOFF "Order submission".
2. **No batch price resolution for a cart.** The cart re-prices each line with
   `GET /vendors/{id}/offers/{productId}?quantity=` (one request per line). Fine for typical carts;
   a 50-line cart costs 50 reads and may meet rate limits. A bulk "price these lines without a
   location" read (or allowing `POST /order-reviews` without a delivery location) would remove it.
3. **Offer list filters allow a single `tagId` and a single `categoryId`.** The UI therefore offers
   single-select tag/category filters (previous mock UI had multi-tag). Not blocking.
4. **Staff submission restriction has no dedicated problem code.** A restricted staff member gets
   `403 FORBIDDEN` (generic `BusinessAccessDenied`) from `POST /orders` / `POST /drafts/{id}/submission`.
   The UI pre-checks `organization.staffSubmissionRestricted` + `account.role` and maps 403 FORBIDDEN
   to the staff-restriction explanation (and refreshes the session); a specific code would avoid guessing.
5. **Draft list has no vendor name.** `GET /drafts` returns `intent.vendorId` only; names come from
   connected vendors (`/relationships` + `/partners/{id}`). Drafts of a disconnected vendor show
   "Vendor no longer connected" because `GET /partners/{id}` is not used for history here.
6. **Unavailable favorites carry no product name or vendor.** `Favorite.offer` is null when unavailable,
   so the UI can only show "saved {date}" with a Remove action. A retained name/SKU snapshot would help.
7. **Order review field errors use `INVALID_VALUE`, not `QUANTITY_INVALID`.** `422` path
   `/intent/lines/{i}/quantity` code `INVALID_VALUE` (observed). The UI validates minimum/step locally
   (same rule as backend: `q >= min && (q - min) % step == 0`) so this is rarely reached; the generic
   422 text is shown when it is.

## Contract ambiguities resolved

- **Quantity rule** — confirmed in backend source and live: steps count from the minimum, max 1e9.
  `cart/quantity.ts` mirrors it; steppers only produce valid values; invalid saved/draft/reorder
  quantities are kept unchanged and flagged with a "Use N" fix (never silently changed).
- **Linked drafts at checkout** — a cart resumed from/saved as a draft first `PUT`s its current intent
  (no-op when equal), then requests a draft-bound review, then submits via
  `POST /drafts/{id}/submission` (consumes the draft). Stale revision → conflict choice: keep mine as
  a new draft / load their version / decide later. Cart work is never discarded silently.
- **Lost responses** — before sending, the submission (`reviewId` + Idempotency-Key, or `reviewId` +
  draft revision) is persisted in the cart as `pendingSubmission`. Network/5xx/`REQUEST_IN_PROGRESS`
  keep it and the user explicitly "Checks status", which repeats the identical request (verified by
  tests). Definite rejections clear it. Never retried automatically.
- **TERMS_CHANGED** — a non-null `currentTerms` replaces the receipt, changed lines are highlighted
  and the button becomes "Confirm updated order" (new receipt ⇒ new key). Null `currentTerms` shows
  `unavailableLines` mapped to product names and returns to editing.
- **Prices** are always shown from server `PriceResolution` (no client price engine; the mock-era
  `pricing/resolvePrice*` was deleted). The cart total is an exact BigInt-cents sum of server line
  totals, labelled "estimate, excl. VAT" and "incomplete" while any line is unpriced/invalid.
- **Active vendor** — remembered per buyer org (session store); auto-switches to the first ACTIVE
  relationship when none/stale; empty state when the buyer has no connection.
- **Checkout locations** use key prefix `['organization','locations']` so agent A's location edits
  invalidate it.

## Operations wired (all exercised live against the local backend)

listRelationships(ACTIVE), getPartner, listOffers (q/sort/categoryId/tagId/featured/paging/total),
getOffer (?quantity), listOfferTaxonomy (cursor), listMostOrdered (vendorId), listFavorites,
addFavorite, removeFavorite, listLocations(ACTIVE), listDrafts, createDraft, getDraft, updateDraft
(+409 REVISION_CONFLICT), discardDraft, submitDraft (+exact replay), reviewOrder (direct and
draft-bound, OVERRIDE instructions), submitOrder (+same-key replay), previewReorder.
Live run (RS buyer, 2026-10-26): 12 offers/3 featured, promotion (5.60→5.04) and agreed price (18.90)
rendered from the server, tier at 24 (0.75), draft-bound submission → order 2026/8 and cart emptied,
direct order 2026/9, stale draft save → REVISION_CONFLICT, discard OK, reorder plan 2 lines.

## Intentionally without UI

- `replacementForOrderId` is preserved through drafts/reorder and can be cleared at checkout, but
  setting it (from a cancelled order) is the order-detail owner's (D1) entry point.
- `GET /drafts/{id}` is used only for conflict recovery ("load their version"); terminal drafts are
  not browsable (the list contains OPEN drafts only, per contract).

## Not verified / local limitations

- No UI run (brief forbids `next dev`/`expo start`); screens are type-checked and linted only.
- Product images: no READY gallery asset exists in seed data, so authenticated image loading
  (web cookie `<img>`, mobile expo-image with bearer header) is implemented but not observed.
- Stock-tracked offers / `INSUFFICIENT_STOCK` / `TERMS_CHANGED` / staff restriction paths are covered
  by unit tests with a fake backend, not reproduced live (seed vendors have tracking off).
- Mobile typed routes: `/buyer/drafts` is cast to `Href` until expo-router regenerates route types.
- `pnpm i18n:index` currently fails because another area's `sr-Latn` namespaces
  (catImport, catProblems, invInventory) are missing; until it is rerun, the new `buyDrafts`
  namespace is not in `resources.gen.ts` and the drafts screens fail type-checking on those keys.

## Core change requests

None required. (Nice to have: `useT` could accept dynamic enum-derived keys without casts.)

## Integration notes for other agents

- Shell (A): render `VendorSwitcher` (web `features/shell/vendor-switcher.tsx`) and on mobile
  `VendorHeaderSwitcher` from `@/features/buyer-catalogue/vendor-header` as the buyer tabs header
  title; cart badge: `useCart().itemCount` (distinct products) from `@/lib/cart`. Add nav entries for
  `/buyer/drafts` (web) and the `drafts` stack screen (mobile; the screen sets its own title).
- Order detail (D1): `const reorderIntoCart = useReorderIntoCart()` from `@/lib/cart` (web and mobile);
  `await reorderIntoCart(preview, { mode: 'merge' | 'replace' })` → `{ vendorId, plan }`
  (`plan.unavailable`, `plan.attention`); then navigate to the cart when `vendorId` is non-null.
