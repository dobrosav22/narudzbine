# Data Contract & API Outline (draft)

**Status: draft, assumed by the frontend, not yet validated against a real
backend implementation.** Everything here is what the frontend's mock
service layer implements today. Fields/endpoints marked **[assumed]** are
the ones most likely to change shape once real backend decisions are made —
see `01-product-overview.md` §11 for the specific open questions.

Endpoints are written REST-style for readability; the real backend doesn't
have to be REST — this is a statement of *what operations must exist*, not
*how they're transported*. If the real backend is GraphQL/RPC/etc., treat
each endpoint below as "one operation the frontend needs," and adjust the
service layer's real implementation accordingly (see
`02-frontend-agent-instructions.md`).

---

## Vendor org

```ts
interface VendorOrg {
  id: string;
  name: string;
  subscriptionTierId: string;
  tracksInventory: boolean; // default policy; may be overridden per-product [assumed]
  createdAt: string;
}

interface SubscriptionTier {
  id: string;
  name: string;
  priceMonthly: number;
  maxProducts: number;
  maxBuyers: number;
}

interface VendorLocation {
  id: string;
  vendorOrgId: string;
  name: string;
  address: string;
}

interface VendorUser {
  id: string;
  vendorOrgId: string;
  email: string;
  name: string;
  homeLocationId?: string; // default context filter only, not a permission
  createdAt: string;
}
```

Endpoints: `GET/POST /vendor-orgs`, `GET/PATCH /vendor-orgs/:id`,
`GET /subscription-tiers`, `POST /vendor-orgs/:id/upgrade-tier`,
`GET/POST/PATCH/DELETE /vendor-orgs/:id/locations`,
`GET/POST/DELETE /vendor-orgs/:id/users`.

---

## Buyer org

```ts
interface BuyerOrg {
  id: string;
  name: string;
  createdAt: string;
}

interface Location {          // buyer-side location = delivery address
  id: string;
  buyerOrgId: string;
  name: string;
  address: string;
}

interface BuyerUser {
  id: string;
  buyerOrgId: string;
  email: string;
  name: string;
  homeLocationId?: string;
  createdAt: string;
}
```

Endpoints: `GET/POST /buyer-orgs`, `GET/PATCH /buyer-orgs/:id`,
`GET/POST/PATCH/DELETE /buyer-orgs/:id/locations`,
`GET/POST/DELETE /buyer-orgs/:id/users`.

---

## Vendor ↔ Buyer relationship & invites

```ts
interface VendorBuyerRelation {
  id: string;
  vendorOrgId: string;
  buyerOrgId: string;
  status: 'invited' | 'active' | 'removed';
  joinedAt?: string;
}

interface Invite {
  id: string;
  type: 'buyer_org_invite' | 'team_member_invite';
  email: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  // for buyer_org_invite:
  vendorOrgId?: string;
  // for team_member_invite:
  targetOrgId?: string;
  targetOrgType?: 'vendor' | 'buyer';
  sentAt: string;
  acceptedAt?: string;
}
```

Endpoints: `GET /vendor-orgs/:id/buyer-connections`,
`POST /vendor-orgs/:id/invites` (buyer_org_invite),
`POST /vendor-orgs/:id/users/invites` or
`/buyer-orgs/:id/users/invites` (team_member_invite),
`POST /invites/:token/accept`, `GET /invites/:token` (to render the
acceptance screen before submission).

---

## Catalogue

```ts
interface Category {
  id: string;
  vendorOrgId: string;
  name: string;
  parentCategoryId?: string; // [assumed] hierarchy support; may end up flat-only
}

interface Tag {
  id: string;
  vendorOrgId: string;
  name: string;
}

interface Product {
  id: string;
  vendorOrgId: string;
  name: string;
  sku: string;
  description?: string;
  categoryId?: string;
  tagIds: string[];
  basePrice: number;
  unit: string; // e.g. "case", "roll"
  stock?: number; // present only if VendorOrg.tracksInventory
  minOrderQuantity?: number;
  imageUrl?: string;
  isActive: boolean;
}

interface PriceTier {
  id: string;
  productId: string;
  minQty: number;
  pricePerUnit: number;
}

interface BuyerProductPrice { // per-buyer negotiated override
  id: string;
  vendorOrgId: string;
  buyerOrgId: string;
  productId: string;
  price: number;
}
```

Endpoints: `GET/POST/PATCH/DELETE /vendor-orgs/:id/products`,
`POST /vendor-orgs/:id/products/bulk-update`,
`GET/POST/DELETE /vendor-orgs/:id/categories`,
`GET/POST/DELETE /vendor-orgs/:id/tags`,
`GET/POST/DELETE /products/:id/price-tiers`,
`GET/POST/DELETE /vendor-orgs/:id/buyer-prices?buyerOrgId=`.

**Price resolution order (resolved 2026-09):**
1. Start from **base price** (`Product.basePrice`).
2. Apply the **quantity tier** matching the order quantity, if any
   (`PriceTier`), replacing the base price.
3. Apply the **buyer-specific negotiated price** (`BuyerProductPrice`), if
   one exists for this buyer+product, replacing the tier/base result.
4. If one or more **promotions** apply, pick the single one that yields the
   **lowest final unit price** (compare resulting prices, not percentage/
   value — a 10% promotion and a flat 2 BAM promotion aren't directly
   comparable any other way) and apply it on top of step 3's result.
   Promotions never stack with each other.
5. A `'fixed'` promotion is an amount off **per unit**, consistent with
   every other price field in the contract being per-unit.

This replaces the earlier `[assumed]` ordering. Frontend expects a single
resolver — `resolvePrice(vendorOrgId, buyerOrgId, productId, quantity)` —
implementing exactly this chain; whether it also exists as a backend
endpoint or stays client-side once real data is wired up is still an open
implementation choice, but the *logic* itself is now fixed.

### Currency

All monetary fields (`basePrice`, `pricePerUnit`, `BuyerProductPrice.price`,
`Promotion.value` when `type: 'fixed'`, order totals) are plain `number`
values in the vendor's operating currency — there is no per-field currency
code, one currency applies app-wide. **Currency is BAM (convertible mark),
sourced from an environment variable** (`CURRENCY` /
`NEXT_PUBLIC_CURRENCY` / `EXPO_PUBLIC_CURRENCY`, whichever each app's
convention needs), never hardcoded — so it's a one-line change if this
ever needs to differ per deployment. Format for display with
`Intl.NumberFormat` using that currency code, not a hardcoded symbol.

---

## Merchandising

```ts
interface FeaturedProduct {
  id: string;
  vendorOrgId: string;
  productId: string;
  position: number;
}

interface Promotion {
  id: string;
  vendorOrgId: string;
  type: 'percentage' | 'fixed';
  value: number;
  scope: 'all' | 'category' | 'product' | 'buyer';
  scopeIds: string[]; // ids matching the scope type
  startDate: string;
  endDate: string;
  isActive: boolean;
}
```

Endpoints: `GET/POST/PATCH/DELETE /vendor-orgs/:id/featured-products`,
`GET/POST/PATCH/DELETE /vendor-orgs/:id/promotions`.

---

## Orders

```ts
interface VendorOrderStatusConfig {
  vendorOrgId: string;
  statuses: {
    key: string;
    label: string;
    isTerminal: boolean;
    isCancelled: boolean;
  }[]; // ordered list; seeded with a sane default on vendor signup
}

interface Order {
  id: string;
  vendorOrgId: string;
  buyerOrgId: string;
  locationId: string;           // buyer delivery location
  fulfillingLocationId?: string; // vendor warehouse, logistics-only
  createdByUserId: string;       // BuyerUser who placed it
  statusKey: string;             // references this vendor's status config
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  priceAtOrder: number; // snapshot, not live-resolved
}

interface OrderMessage {
  id: string;
  orderId: string;
  senderUserId: string;
  senderOrgType: 'vendor' | 'buyer';
  text: string;
  createdAt: string;
}
```

Endpoints: `GET/POST /orders` (filterable by vendorOrgId, buyerOrgId,
locationId, statusKey, date range), `GET /orders/:id`,
`PATCH /orders/:id/status`, `GET/POST /orders/:id/messages`,
`GET/PATCH /vendor-orgs/:id/order-status-config`.

---

## Buyer conveniences

```ts
interface BuyerFavorite {
  id: string;
  buyerUserId: string; // [assumed] personal, not org-shared — confirm
  productId: string;
}

interface DraftCart {
  id: string;
  buyerOrgId: string;
  vendorOrgId: string;
  locationId?: string;
  createdByUserId: string;
  items: { productId: string; quantity: number }[];
  updatedAt: string;
}
```

Endpoints: `GET/POST/DELETE /buyer-users/:id/favorites`,
`GET/POST/PATCH/DELETE /buyer-orgs/:id/draft-carts?vendorOrgId=`.

"Most ordered" and reorder don't need their own stored entity — they're
derived from `Order`/`OrderItem` history:
`GET /buyer-orgs/:id/most-ordered?vendorOrgId=`,
`POST /orders/:id/reorder` (returns a new cart payload with re-resolved
prices).

---

## Notifications

```ts
type NotificationType =
  | 'order_placed'
  | 'order_status_changed'
  | 'order_message_received'
  | 'invite_received'
  | 'promotion_pushed'
  | 'low_stock';

interface NotificationPreference {
  userId: string;
  userType: 'vendor' | 'buyer';
  notificationType: NotificationType;
  channel: 'push' | 'email';
  enabled: boolean;
}
```

Endpoints: `GET/PATCH /users/:id/notification-preferences`. Backend also
needs to actually *send* pushes/emails on each event — out of scope for the
frontend contract, but the preference model above is what the frontend
reads/writes.

---

## Stats (all read-only, likely aggregation endpoints, not stored entities)

`GET /vendor-orgs/:id/stats/summary`,
`GET /vendor-orgs/:id/stats/by-product?period=`,
`GET /vendor-orgs/:id/stats/by-buyer?period=`,
`GET /buyer-orgs/:id/stats/summary?vendorOrgId=&period=`.

Exact aggregation shape (totals vs. time-series, available period buckets)
is **[assumed]** and should be finalized with whoever builds the backend —
the frontend just needs *some* shape to chart against for now.
