# Product Overview — B2B Ordering Platform (v1.1)

**Changelog since v1.0:** explicit multi-tenancy architecture statement
(§1); subscriptions rewritten — hard-enforced limits, tier config via file,
self-serve upgrade replaced with an upgrade-request flow (§2); new
Platform Admin role and its screens (§10, §11); section numbers 10–12 from
v1.0 shifted to 11–13 accordingly. Bilingual support (§12) is unchanged
from v1.0.

## What this is

A single app, two operator-facing roles: **Vendors** sell/manage a
catalogue and receive orders; **Buyers** browse a vendor's catalogue and
place orders. A third role, **Platform Admin**, sits above both (see §10).
Example vendor: a paper/hygiene supplies wholesaler. This is a B2B,
repeat-ordering context — not consumer e-commerce.

Platform targets: **web (responsive) + mobile**, with the mobile app
buildable as a standalone **APK**.

This document describes the *whole shape* of the product as currently
understood. It is a planning artifact, not a contract — see
`04-data-contract-api-outline.md` for the part that matters once a real
backend is being built.

---

## 1. Organizations, not individual accounts

Both vendors and buyers are **organizations with multiple logins**, not
single accounts:

- **VendorOrg** — the selling company. Has a subscription, a catalogue,
  settings, one or more **VendorLocations** (warehouses/branches), and one or
  more **VendorUsers** (individual logins, e.g. `mark@vendor.com`).
- **BuyerOrg** — the buying company. Has one or more **Locations**
  (branches/delivery points — a location also serves as a delivery address),
  and one or more **BuyerUsers** (e.g. `mark@buyer.com`, `john@buyer.com`).

**Roles are flat.** Any user within an org can do anything that org can do —
there is no owner/staff permission split. A user can optionally have a
"home location" which is just a default context filter (which location's
orders/cart they see first), not an access restriction — any user can switch
to view another location's data.

A **BuyerOrg can be connected to multiple VendorOrgs** (e.g. a buyer sources
paper towels from Vendor A and cleaning supplies from Vendor B). Buyers
switch "vendor context" in the app; the cart and most of the UI is scoped to
one active vendor at a time (no cross-vendor combined cart).

**Multi-tenancy:** all vendors and buyers live in **one shared
application/database**, not a separate instance per vendor. This is a
direct consequence of the buyer-side multi-vendor design above — a single
buyer login switching between vendors is only possible if one system knows
about all of them at once. Concretely this means **logical** multi-tenancy:
every vendor-scoped record carries a `vendorOrgId` and every query filters
by it; isolation between vendors is enforced by that scoping plus auth
(a session only ever has access to the org(s) it belongs to), not by
physical separation. A backend team could still choose to physically
shard or isolate a given vendor's data under the hood later for
scaling/compliance reasons — that's an infra decision that doesn't need to
change this contract, since the frontend just talks to "the API" either
way.

---

## 2. Subscriptions (vendor side)

Vendors are assigned a subscription tier that limits their catalogue size
and buyer count (e.g. Starter / Growth / Pro, each with a max product
count and max connected-buyer count).

- **Tier definitions live in a single editable config file**, not a
  database table managed through an admin UI and not environment
  variables (a structured list of tiers doesn't fit env vars cleanly) —
  see `04-data-contract-api-outline.md` and
  `02-frontend-agent-instructions.md` for the exact location. This keeps
  pricing/limits easy to adjust without touching business logic and
  without needing to build a tier-authoring UI.
- **Limits are hard-enforced.** When a vendor is at or over a limit, the
  blocking action — adding a product, inviting a buyer — is disabled
  outright (not just rejected after submission), with an inline message
  and a path to request an upgrade.
- **Vendors cannot self-serve upgrade.** There is no in-app payment for
  subscriptions, consistent with there being none for orders either.
  Instead, a vendor submits an **upgrade request** (desired tier + an
  optional note) from Subscription & Billing. Only a Platform Admin can
  actually change a vendor's tier — see §10. This is a deliberate
  placeholder: once real subscription billing exists, this almost
  certainly needs an actual payment step, not just an admin-resolved
  request — treat the request-based flow as good enough for now, not as
  the final billing model.

---

## 3. Catalogue management (vendor side)

- Products belong to **Categories** and can have multiple **Tags** — both
  vendor-defined, not global.
- Inventory tracking is **optional per vendor** — some vendors won't bother
  tracking stock at all; the UI must work with or without stock numbers
  present (no hard dependency on `stock` being non-null anywhere).
- **Minimum order quantity** per product (optional).
- **Quantity-based pricing tiers** — e.g. 1–9 units at price X, 10–49 at
  price Y, 50+ at price Z.
- **Per-buyer custom pricing** — a vendor can set a negotiated price for a
  specific buyer org on a specific product, overriding the standard price.
- Bulk-editing matters — vendors with many SKUs (size/pack variants) need an
  efficient table-style catalogue view, not a form-per-product workflow.

**Price resolution** — see `04-data-contract-api-outline.md`'s Price
resolution order section (resolved, not a draft assumption).

---

## 4. Featured products & promotions (vendor side)

- Vendors can curate a **Featured Products** list (manually ordered) shown
  prominently to buyers.
- Vendors can create **Promotions/Discounts**: percentage or fixed, scoped to
  specific products, categories, the whole catalogue, or specific buyers, with
  a start/end date.

---

## 5. Orders

- **Order statuses are configurable per vendor**, not a fixed global enum.
  A vendor gets a sensible default list on signup (e.g. Placed → Confirmed →
  Fulfilled, with Cancelled always available as a terminal state) and can
  edit it. Both the vendor's order-management UI and the buyer's tracking UI
  render whatever the vendor has configured — no hardcoded status stepper.
- No in-app payment — orders are placed and payment is handled offline.
  Order records don't need payment fields.
- Every order carries: which buyer location it's for (delivery), optionally
  which vendor location is fulfilling it, and who (which individual user)
  placed it.
- **Order messaging** — a simple message thread attached to each order,
  visible to both sides, for buyer/vendor back-and-forth about that specific
  order.

---

## 6. Buyer-side conveniences

- **Favorites** — buyers can favorite individual products.
- **Most-ordered shelf** — a "your most ordered" section, computed from the
  buyer's own order history (distinct from the vendor's curated "featured"
  section).
- **Repeat order** — re-add a past order's line items to a fresh cart
  (re-resolving current prices, not the frozen historical price).
- **Buyer's own stats** — spend and order frequency by product and by
  period, scoped to their relationship with the current vendor.
- **Draft carts** — a cart can be parked and resumed later. Draft carts are
  created by an individual user but visible to the whole buyer org (so
  teammates can see each other's in-progress carts); the current user's own
  draft(s) are shown first.
- **Multiple delivery locations/addresses** per buyer org, selected at
  checkout.

---

## 7. Locations (both sides)

Both vendor orgs and buyer orgs can have multiple locations
(warehouses/branches for vendors, delivery points/branches for buyers). This
is modeled as a scoping/filtering dimension, not a hard permission wall —
consistent with the flat-roles decision above. A user has an optional "home
location" as a default view, but isn't locked out of other locations in
their own org.

Vendor-side stock is tracked at the **product level**, not per-warehouse —
splitting inventory across locations is a real inventory-accounting problem
intentionally kept out of scope for this frontend-first plan. A
`fulfillingLocationId` on an order is logistics/routing metadata, not an
inventory ledger.

---

## 8. Notifications

- Two channels: **push** and **email**, so buyers/vendors who don't
  regularly open the app still get notified.
- Configurable per notification type × channel (e.g. "order status changed"
  can be push-only, email-only, both, or off).
- Notification types include (non-exhaustive): order placed, order status
  changed, new message on an order, invite received, promotion pushed,
  low-stock alert (vendor side, only relevant if inventory tracking is on).

---

## 9. Invites & onboarding

Two distinct kinds of invite:

1. **Vendor invites a buyer org** — email invite; if the recipient is new,
   they register (creating a BuyerOrg + first BuyerUser + a default
   Location) and are connected to the inviting vendor. If they already have
   an account, the vendor connection is simply added.
2. **Team member invite** — an existing org (vendor or buyer) invites another
   person to join *their* org as an additional user.

A Platform Admin can also directly link or unlink a BuyerOrg to/from a
VendorOrg (see §10) — this bypasses the invite flow entirely and is meant
for admin correction/support use, not the normal path.

---

## 10. Platform Admin

A third tier of user, sitting above both vendor and buyer orgs — not tied
to any VendorOrg or BuyerOrg.

- **Single account for now** — not a multi-user admin team yet. Flat
  permissions (consistent with the rest of the app): the one admin account
  can do everything below. Revisit if a multi-admin team is ever needed.
- Bilingual like the rest of the app (§12). Lives inside `apps/web` as a
  role-gated section, not a separate application — see
  `02-frontend-agent-instructions.md`.

**Capabilities:**
- **Platform-wide overview** — total vendors, total buyers, total users.
- **Vendors list & detail** — every VendorOrg, with usage (products,
  orders, buyers, users) vs. their tier's limits at a glance.
- **Direct tier changes** — the only way a vendor's tier actually changes
  (see §2). Also where pending **upgrade requests** are reviewed: apply
  the requested tier (or a different one) and mark it fulfilled, or
  dismiss it.
- **Buyers list & detail** — every BuyerOrg, and which vendors it's
  connected to.
- **Link / unlink** a BuyerOrg to/from a VendorOrg directly, reachable
  from either a vendor's or a buyer's detail view — reuses the same
  underlying connection record the normal invite flow creates.

---

## 11. Screens (by role)

**Vendor:**
Dashboard/stats summary · Catalogue (list, categories/tags, bulk edit) ·
Product detail/edit (pricing tiers, per-buyer overrides) · Featured products
& promotions · Orders (list + detail + status update + messaging) · Order
status configuration · Buyers (list, invite, per-buyer detail/pricing) ·
Locations/warehouses · Team members · Subscription & billing (usage,
request an upgrade) · Notification settings · Stats module (by product, by
buyer, by period)

**Buyer:**
Vendor switcher · Catalogue browse (search/filter, featured shelf,
most-ordered shelf) · Product detail · Cart · Draft carts list · Checkout
(choose delivery location) · Order history (filterable by location) · Order
detail (status tracker + messaging) · Favorites · Own stats · Locations /
addresses · Team members · Notification settings

**Admin:**
Dashboard (platform totals) · Vendors list & detail (usage, tier, change
tier, pending upgrade requests, connected buyers, link/unlink) · Buyers
list & detail (connected vendors, link/unlink)

**Shared:**
Login / register · Invite acceptance (org invite, team invite) · Account
profile

---

## 12. Bilingual support (EN + Serbian, Latin script)

The app supports **English and Serbian (Latin script only)**. Scope:

- Covers UI chrome — labels, buttons, navigation, system-generated text
  (notifications, status labels, validation messages).
- Does **not** cover vendor/buyer-entered content — a product name,
  description, category, or order message stays exactly as typed, in
  whatever language the person who typed it used. No auto-translation of
  user content.
- **Language is a per-individual-user preference** (`preferredLocale` on
  `VendorUser`/`BuyerUser`/`PlatformAdmin`), not an org-wide setting —
  consistent with the flat multi-user-per-org model. Mark and John at the
  same buyer org can each run the app in a different language.
- Set via a language switcher in account settings; defaults to the
  browser/device locale on first login if it matches, else English.

---

## 13. Open questions / assumptions to revisit

These were simplified or assumed during planning and are worth confirming
once real business rules or a real backend are being defined:

- Whether category hierarchy is flat or nested (currently assumed flat,
  vendor-scoped).
- Billing/subscription accountability (who gets billing emails) even though
  there's no formal "billing role."
- Whether draft carts should ever expire.
- Whether Platform Admin ever needs to be a multi-user team.
- The upgrade-request flow (§2) is explicitly a placeholder — real
  subscription billing will likely need a payment step this doesn't have.

**Resolved since initial planning:**
- **Price precedence** — see `04-data-contract-api-outline.md`'s Price
  resolution order section.
- **Currency:** BAM, sourced from an environment variable app-wide (not
  hardcoded, not per-field) — see `04-data-contract-api-outline.md`.
- **Mobile styling approach:** NativeWind — see
  `05-visual-design-system.md` §5.
- **Tier limit enforcement:** hard block, config-file-defined tiers,
  admin-resolved upgrade requests — see §2 and §10 above.
