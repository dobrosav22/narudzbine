# Product Overview — B2B Ordering Platform

## What this is

A single app, two roles: **Vendors** sell/manage a catalogue and receive orders;
**Buyers** browse a vendor's catalogue and place orders. Example vendor: a
paper/hygiene supplies wholesaler. This is a B2B, repeat-ordering context —
not consumer e-commerce.

Platform targets: **web (responsive) + mobile**, with the mobile app buildable
as a standalone **APK**.

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

---

## 2. Subscriptions (vendor side)

Vendors subscribe to a tier that limits their catalogue size and buyer count
(e.g. Starter / Growth / Pro, each with a max product count and max
connected-buyer count). The UI needs to be ready to show "you've hit your
plan limit" prompts anywhere a vendor tries to exceed their tier (adding a
product, inviting a buyer).

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

**Price resolution** (draft order, needs confirming against real business
rules once backend is designed): buyer-specific override → quantity tier →
base price, with any active promotion applied on top. This logic should live
in a single resolver function in the frontend's service layer, not be
duplicated across cart/catalogue components.

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

---

## 10. Screens (by role)

**Vendor:**
Dashboard/stats summary · Catalogue (list, categories/tags, bulk edit) ·
Product detail/edit (pricing tiers, per-buyer overrides) · Featured products
& promotions · Orders (list + detail + status update + messaging) · Order
status configuration · Buyers (list, invite, per-buyer detail/pricing) ·
Locations/warehouses · Team members · Subscription & billing · Notification
settings · Stats module (by product, by buyer, by period)

**Buyer:**
Vendor switcher · Catalogue browse (search/filter, featured shelf,
most-ordered shelf) · Product detail · Cart · Draft carts list · Checkout
(choose delivery location) · Order history (filterable by location) · Order
detail (status tracker + messaging) · Favorites · Own stats · Locations /
addresses · Team members · Notification settings

**Shared:**
Login / register · Invite acceptance (org invite, team invite) · Account
profile

---

## 11. Open questions / assumptions to revisit

These were simplified or assumed during planning and are worth confirming
once real business rules or a real backend are being defined:

- ~~Exact precedence when a promotion and a per-buyer custom price both
  apply to the same product.~~ **Resolved 2026-09** — see
  `04-data-contract-api-outline.md`'s Price resolution order section.
- Whether category hierarchy is flat or nested (currently assumed flat,
  vendor-scoped).
- Billing/subscription accountability (who gets billing emails) even though
  there's no formal "billing role."
- Whether draft carts should ever expire.

**Resolved since initial planning:**
- **Currency:** BAM, sourced from an environment variable app-wide (not
  hardcoded, not per-field) — see `04-data-contract-api-outline.md`.
- **Mobile styling approach:** NativeWind — see
  `05-visual-design-system.md` §5.
