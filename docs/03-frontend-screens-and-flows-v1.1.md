# Screens & Flows (v1.1)

**Changelog since v1.0:** new Admin screens section; Subscription &
Billing rewritten for the request-based upgrade flow; Catalogue and Buyers
(invite) entries now note tier-limit hard-blocking; new Tier upgrade flow
at the end.

Companion to `02-frontend-agent-instructions.md`. For each screen: its
purpose, the main service calls it depends on, and notable state. This is a
build checklist, not final UI/UX design.

## Navigation shape

- **Auth stack** (unauthenticated): Login, Register, Invite Acceptance.
- **Vendor shell** (authenticated as a VendorUser): tab/side-nav with
  Dashboard, Catalogue, Orders, Buyers, Locations, Stats, Team, Settings.
- **Buyer shell** (authenticated as a BuyerUser): tab/side-nav with Home
  (catalogue browse for active vendor), Cart, Orders, Favorites, Stats,
  Settings. A persistent **vendor switcher** sits above this whole shell if
  the buyer belongs to more than one VendorOrg.
- **Admin shell** (authenticated as a PlatformAdmin, web-only): nav with
  Dashboard, Vendors, Buyers.

A user could in principle be both a VendorUser and a BuyerUser under
different orgs — if so, an org-type switcher sits above both shells. Not
core to v1 but the session model should not prevent it. A PlatformAdmin
session is distinct from both and routes straight into the admin shell.

---

## Vendor screens

**Dashboard** — top-line stats (recent orders, revenue trend, low-stock
alerts if tracking is on). Calls `services.stats.getVendorSummary(vendorOrgId)`.

**Catalogue** — table view of products, filter/search by category/tag,
bulk-select for bulk price/tag edits. Calls
`services.catalogue.listProducts`, `.bulkUpdate`. **Add Product is
tier-gated:** check `services.subscription.getUsage(vendorOrgId)` first —
if at/over `maxProducts`, the Add Product control is disabled with a
message linking to Subscription & Billing.

**Product detail/edit** — base price, unit, min order qty, stock (only shown
if `VendorOrg.tracksInventory`), category/tags, quantity price tiers,
per-buyer price overrides list, images. Calls
`services.catalogue.getProduct/updateProduct`,
`services.pricing.listBuyerOverrides/setBuyerOverride`.

**Featured & Promotions** — two tabs or sections: reorderable featured
product list; promotions list/create/edit (scope, dates, value). Calls
`services.merchandising.*`.

**Orders (list)** — filter by status, location, buyer, date range. Calls
`services.orders.listOrders`.

**Order detail** — line items, buyer/location info, status changer (driven
by that vendor's `VendorOrderStatusConfig`, not a hardcoded stepper),
message thread. Calls `services.orders.getOrder/updateOrderStatus`,
`services.orders.addOrderMessage`.

**Order status configuration** (Settings) — edit the ordered list of
statuses this vendor uses. Calls `services.orderStatusConfig.*`.

**Buyers** — list of connected BuyerOrgs, invite form (email), per-buyer
detail screen showing their custom pricing overrides and order history with
this vendor. Calls `services.buyers.listConnections`,
`services.invites.create`. **Invite is tier-gated**, same pattern as Add
Product: check usage vs. `maxBuyers` first, disable the invite control at
the limit.

**Locations** — list/add/edit VendorLocations. Calls `services.locations.*`.

**Team** — list of VendorUsers, invite form. Calls `services.team.*`,
`services.invites.create`.

**Subscription & billing** — current tier, usage vs. limits (product
count, buyer count) via `services.subscription.getUsage`, and a **request
upgrade** action (desired tier + optional note) via
`services.subscription.requestUpgrade`. Shows this vendor's own upgrade
request history and its status (pending/fulfilled/dismissed). No
self-serve tier change here — that only happens via the admin panel.

**Notification settings** — matrix of notification type × channel toggles.
Calls `services.notifications.getPreferences/updatePreference`.

**Account settings** (both roles, same pattern) — includes the language
switcher (`preferredLocale`) alongside profile fields. Calls
`services.preferences.updateLocale`.

**Stats module** — separate, deeper than the dashboard: by-product view
(units, revenue, trend) and by-buyer view (frequency, spend, last order),
both filterable by period and location. Calls `services.stats.byProduct`,
`.byBuyer`.

---

## Buyer screens

**Vendor switcher** — list of connected VendorOrgs (shown as a picker, not
necessarily a full screen); selecting one sets the active-vendor context for
everything below.

**Catalogue browse (Home)** — featured shelf (vendor-curated), most-ordered
shelf (derived from this buyer's history with the active vendor), search/
filter by category/tag. Calls `services.catalogue.listProducts` (buyer-
scoped, price-resolved), `services.stats.getMostOrdered`.

**Product detail** — resolved price (showing "your price" if it differs from
list price), quantity tiers displayed if applicable, favorite toggle, add to
cart. Calls `services.pricing.resolvePrice`, `services.favorites.toggle`.

**Cart** — items for the active vendor + a chosen delivery location; save as
draft; proceed to checkout. Calls `services.cart.*`.

**Draft carts (list)** — all draft carts for this BuyerOrg + active vendor,
the current user's own shown first. Resume or discard. Calls
`services.draftCarts.list/resume/discard`.

**Checkout** — pick delivery Location from the buyer org's list, review
items, confirm (no payment step). Calls `services.orders.createOrder`.

**Order history** — list, filterable by location and status. Calls
`services.orders.listOrders` (buyer-scoped).

**Order detail** — status tracker rendered from the vendor's configured
statuses, message thread, "reorder" action. Calls `services.orders.getOrder`,
`services.orders.reorder`, `services.orders.addOrderMessage`.

**Favorites** — list of favorited products for quick access/reorder. Calls
`services.favorites.list`.

**Own stats** — spend/order frequency by product and period, scoped to this
buyer org + active vendor. Calls `services.stats.getBuyerSummary`.

**Locations** — list/add/edit delivery locations for the BuyerOrg. Calls
`services.locations.*`.

**Team** — list of BuyerUsers, invite form. Calls `services.team.*`.

**Notification settings** — same pattern as vendor side.

---

## Admin screens (NEW in v1.1)

**Admin dashboard** — platform-wide totals: total vendors, total buyers,
total users. Calls `services.admin.getPlatformSummary()`.

**Vendors list** — every VendorOrg, searchable, showing current tier and
usage (products/buyers vs. limits) at a glance. Calls
`services.admin.listVendorOrgs()`.

**Vendor detail** — full usage breakdown, current tier with a direct
**set tier** control (`services.admin.setTier(vendorOrgId, tierId)`), this
vendor's pending/past upgrade requests with **resolve** (apply a tier,
which can be the requested one or a different one) and **dismiss**
actions (`services.admin.resolveUpgradeRequest(...)`), basic stats
(product count, order count, buyer count, user count), and a drill-down
list of this vendor's connected buyers with an **unlink** action and a
way to **link** an existing buyer org. Calls
`services.admin.getVendorOrgDetail(vendorOrgId)`,
`services.admin.linkVendorBuyer(...)`,
`services.admin.unlinkVendorBuyer(...)`.

**Buyers list** — every BuyerOrg, searchable. Calls
`services.admin.listBuyerOrgs()`.

**Buyer detail** — which vendors this buyer org is connected to, with the
same link/unlink actions as Vendor detail (reachable from either
direction). Calls `services.admin.getBuyerOrgDetail(buyerOrgId)`.

---

## Shared screens

**Login / Register** — standard auth. Register determines whether the user
is creating a brand-new org or joining one via an invite token in the URL.
A PlatformAdmin doesn't go through Register — see Admin panel section of
`02-frontend-agent-instructions.md` (single seeded account, no signup
flow).

**Invite acceptance** — two variants driven by invite type:
- *Org invite* (vendor invited a new buyer): register → creates BuyerOrg +
  first BuyerUser + default Location → VendorBuyerRelation set active.
- *Team invite* (join an existing org): register or log in → added as an
  additional user on that existing org.

---

## Key flows (end to end)

**Vendor onboarding:** sign up → choose subscription tier → create first
VendorLocation → build initial catalogue (products/categories/tags) → invite
first buyers.

**Buyer invite flow:** vendor sends email invite → recipient clicks link →
if new: registers, BuyerOrg + BuyerUser + default Location created,
connection set active → if existing: connection added to their account,
notified.

**Ordering flow:** buyer picks active vendor → browses catalogue (prices
resolved: buyer override → quantity tier → base, promotions applied on top)
→ adds to cart or resumes a draft → checkout, picks delivery location →
order created with the vendor's first configured status → vendor progresses
status → buyer gets notified (push/email per their preferences) at each
change → either side can message on the order.

**Promotion flow:** vendor creates a promotion scoped to product(s)/
category/buyer(s) with a date range → active promotions factor into price
resolution automatically wherever price is displayed or calculated.

**Reorder flow:** buyer opens a past order → taps reorder → line items
copied into a fresh cart with current (not historical) resolved prices →
buyer reviews before checking out (in case of price changes or removed
products).

**Tier upgrade flow (NEW in v1.1):** vendor hits a limit (blocked from
adding a product or inviting a buyer) → follows the link to Subscription &
Billing → submits an upgrade request (tier + optional note) → request
appears in the admin's pending queue → admin resolves it (applies a tier,
fulfilling the request) or dismisses it → vendor sees the updated
status/tier on their own Subscription & Billing screen, and the blocked
action is now available if the new tier's limits allow it.
