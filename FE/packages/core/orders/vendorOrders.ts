/**
 * Vendor-side order helpers shared by apps/web and apps/mobile (03 → vendor
 * "Orders", "Order detail", "Order status configuration", "Buyers").
 */
import { msg, type Msg } from '../i18n/message';
import type { AppServices } from '../services';
import type {
  BuyerOrg,
  BuyerProductPrice,
  BuyerStat,
  BuyerUser,
  Invite,
  Location,
  Order,
  OrderStatus,
  Product,
  VendorBuyerRelation,
  VendorLocation,
  VendorOrderStatusConfig,
  VendorUser,
} from '../types';

// ── Status progression ───────────────────────────────────────────────────

/**
 * The next happy-path status after `statusKey` — what the vendor's primary
 * "Mark as …" button offers. Undefined once the order is terminal or cancelled.
 */
export function nextStatus(config: VendorOrderStatusConfig, statusKey: string): OrderStatus | undefined {
  const current = config.statuses.find((s) => s.key === statusKey);
  if (!current || current.isTerminal) return undefined;
  const happy = config.statuses.filter((s) => !s.isCancelled);
  return happy[happy.findIndex((s) => s.key === statusKey) + 1];
}

export function cancelledStatus(config: VendorOrderStatusConfig): OrderStatus | undefined {
  return config.statuses.find((s) => s.isCancelled);
}

// ── Status configuration editing ─────────────────────────────────────────

/** A stable machine key for a new status label ("Out for delivery" → "out_for_delivery"), unique within the list. */
export function statusKeyFromLabel(label: string, existingKeys: string[]): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'status';
  let key = base;
  for (let n = 2; existingKeys.includes(key); n++) key = `${base}_${n}`;
  return key;
}

/**
 * Client-side mirror of the service's rules (mocks/orders.ts) so problems show
 * before saving. Whether a removed status is still used by orders is checked
 * by the service only — it knows every order.
 */
export function statusListProblems(statuses: OrderStatus[]): Msg[] {
  const problems: Msg[] = [];
  if (statuses.some((s) => !s.label.trim())) problems.push(msg('errors.statusNeedsLabel'));
  const labels = statuses.map((s) => s.label.trim().toLowerCase()).filter(Boolean);
  if (new Set(labels).size !== labels.length) problems.push(msg('errors.statusKeysUnique'));
  if (statuses[0]?.isTerminal || statuses[0]?.isCancelled) problems.push(msg('errors.firstStatusTerminal'));
  if (!statuses.some((s) => s.isTerminal && !s.isCancelled)) problems.push(msg('errors.needsCompleted'));
  if (!statuses.some((s) => s.isCancelled)) problems.push(msg('errors.needsCancelled'));
  return problems;
}

/** Move one status up or down; returns a new list. */
export function moveStatus(statuses: OrderStatus[], index: number, delta: -1 | 1): OrderStatus[] {
  const to = index + delta;
  if (to < 0 || to >= statuses.length) return statuses;
  const next = [...statuses];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

// ── Lookup context for vendor order screens ──────────────────────────────

type Deps = Pick<AppServices, 'buyers' | 'locations' | 'team' | 'orderStatusConfig' | 'catalogue'>;

export interface VendorOrderContext {
  config: VendorOrderStatusConfig;
  buyers: Map<string, BuyerOrg>;
  /** Buyer delivery locations for every connected buyer. */
  buyerLocations: Map<string, Location>;
  buyerUsers: Map<string, BuyerUser>;
  vendorUsers: Map<string, VendorUser>;
  vendorLocations: Map<string, VendorLocation>;
  /** Includes inactive products — past orders must still show names. */
  products: Map<string, Product>;
}

/**
 * Everything needed to label a vendor's orders. [assumed] The vendor may read
 * its connected buyers' locations and users (names on orders) — the backend
 * may prefer to embed these in the order payload instead.
 */
export async function loadVendorOrderContext(deps: Deps, vendorOrgId: string): Promise<VendorOrderContext> {
  const [config, connections, vendorUsers, vendorLocations, products] = await Promise.all([
    deps.orderStatusConfig.get(vendorOrgId),
    deps.buyers.listConnections(vendorOrgId),
    deps.team.listVendorUsers(vendorOrgId),
    deps.locations.listVendorLocations(vendorOrgId),
    deps.catalogue.listProducts({ vendorOrgId, includeInactive: true }),
  ]);
  const perBuyer = await Promise.all(
    connections.map(async (c) => {
      const [locations, users] = await Promise.all([
        deps.locations.listBuyerLocations(c.buyerOrg.id),
        deps.team.listBuyerUsers(c.buyerOrg.id),
      ]);
      return { locations, users };
    }),
  );
  return {
    config,
    buyers: new Map(connections.map((c) => [c.buyerOrg.id, c.buyerOrg])),
    buyerLocations: new Map(perBuyer.flatMap((b) => b.locations.map((l) => [l.id, l] as const))),
    buyerUsers: new Map(perBuyer.flatMap((b) => b.users.map((u) => [u.id, u] as const))),
    vendorUsers: new Map(vendorUsers.map((u) => [u.id, u])),
    vendorLocations: new Map(vendorLocations.map((l) => [l.id, l])),
    products: new Map(products.map((p) => [p.id, p])),
  };
}

/** Open = not in a terminal status — what a vendor needs to act on. */
export function isOpenOrder(config: VendorOrderStatusConfig, order: Pick<Order, 'statusKey'>): boolean {
  return !config.statuses.find((s) => s.key === order.statusKey)?.isTerminal;
}

// ── Buyers ───────────────────────────────────────────────────────────────

export interface BuyerRow {
  kind: 'connected' | 'invited' | 'pendingInvite';
  /** Absent for an invite to someone who has no account yet. */
  buyerOrg?: BuyerOrg;
  relation?: VendorBuyerRelation;
  invite?: Invite;
  /** Display name: the org, or the invited email. */
  name: string;
  stats?: BuyerStat;
}

/**
 * 03 → vendor "Buyers": connected buyer orgs, existing orgs invited but not yet
 * accepted, and invites to brand-new buyers (no org until they accept).
 */
export async function loadBuyerRows(
  deps: Pick<AppServices, 'buyers' | 'invites' | 'stats'>,
  vendorOrgId: string,
): Promise<BuyerRow[]> {
  const [connections, invites, stats] = await Promise.all([
    deps.buyers.listConnections(vendorOrgId),
    deps.invites.listSent({ vendorOrgId }),
    deps.stats.byBuyer(vendorOrgId, { period: 'all' }),
  ]);
  const invitedEmails = new Set(connections.map((c) => c.pendingInviteEmail).filter(Boolean));
  const rows: BuyerRow[] = connections.map((c) => ({
    kind: c.relation.status === 'active' ? 'connected' : 'invited',
    buyerOrg: c.buyerOrg,
    relation: c.relation,
    invite: invites.find((i) => i.email === c.pendingInviteEmail),
    name: c.buyerOrg.name,
    stats: stats.find((s) => s.buyerOrgId === c.buyerOrg.id),
  }));
  for (const invite of invites) {
    if (invite.type === 'buyer_org_invite' && !invitedEmails.has(invite.email)) {
      rows.push({ kind: 'pendingInvite', invite, name: invite.email });
    }
  }
  const rank = { connected: 0, invited: 1, pendingInvite: 2 } as const;
  return rows.sort((a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name));
}

export interface BuyerDetail {
  buyerOrg: BuyerOrg;
  relation: VendorBuyerRelation;
  overrides: (BuyerProductPrice & { product?: Product })[];
  orders: Order[];
  stats?: BuyerStat;
}

/** 03 → vendor per-buyer detail: their custom prices and order history with this vendor. */
export async function loadBuyerDetail(
  deps: Pick<AppServices, 'buyers' | 'pricing' | 'orders' | 'stats' | 'catalogue'>,
  vendorOrgId: string,
  buyerOrgId: string,
): Promise<BuyerDetail> {
  const [connection, overrides, orders, stats, products] = await Promise.all([
    deps.buyers.getConnection(vendorOrgId, buyerOrgId),
    deps.pricing.listBuyerOverrides({ vendorOrgId, buyerOrgId }),
    deps.orders.listOrders({ vendorOrgId, buyerOrgId }),
    deps.stats.byBuyer(vendorOrgId, { period: 'all' }),
    deps.catalogue.listProducts({ vendorOrgId, includeInactive: true }),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    buyerOrg: connection.buyerOrg,
    relation: connection.relation,
    overrides: overrides
      .map((o) => ({ ...o, product: byId.get(o.productId) }))
      .sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? '')),
    orders,
    stats: stats.find((s) => s.buyerOrgId === buyerOrgId),
  };
}

/**
 * [assumed] The mock can't send email, so screens show the invite link to copy.
 * The real backend emails it; keep the link visible only while mocked.
 */
export function invitePath(invite: Pick<Invite, 'token'>): string {
  return `/invite/${invite.token}`;
}

// ── Date range filter (vendor order lists, both apps) ────────────────────

export type OrderDateRange = '7' | '30' | '90' | 'all';

/** `labelKey` for compact toggles ("7 days"), `longKey` for chips ("Last 7 days"). */
export const ORDER_DATE_RANGES: { value: OrderDateRange; labelKey: string; longKey: string }[] = [
  { value: '7', labelKey: 'dateRanges.7', longKey: 'dateRanges.last7' },
  { value: '30', labelKey: 'dateRanges.30', longKey: 'dateRanges.last30' },
  { value: '90', labelKey: 'dateRanges.90', longKey: 'dateRanges.last90' },
  { value: 'all', labelKey: 'dateRanges.all', longKey: 'dateRanges.all' },
];

/**
 * The `from` filter for a range, computed when the range is picked (an event), never
 * during render — so a list doesn't refetch every time "now" moves.
 */
export function orderRangeStart(range: OrderDateRange, now: Date = new Date()): string | undefined {
  return range === 'all' ? undefined : new Date(now.getTime() - Number(range) * 86_400_000).toISOString();
}
