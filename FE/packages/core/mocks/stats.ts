import type { StatsService } from '../services';
import type { MostOrderedItem, Order, PeriodBucket, ProductStat, StatsPeriod } from '../types';
import { LOW_STOCK_THRESHOLD } from '../constants';
import { orderTotal } from '../helpers';
import { roundMoney } from '../pricing';
import { db } from './db';
import { clone, delay, findOrThrow } from './util';

const DAY = 86_400_000;
const PERIOD_DAYS: Record<StatsPeriod, number | null> = { '30d': 30, '90d': 90, '12m': 365, all: null };

function cancelledKeys(vendorOrgId: string): Set<string> {
  const config = db.statusConfigs.find((c) => c.vendorOrgId === vendorOrgId);
  return new Set(config?.statuses.filter((s) => s.isCancelled).map((s) => s.key));
}

/** Orders that count toward revenue/spend: not cancelled, inside the period. */
function countedOrders(filter: (o: Order) => boolean, period: StatsPeriod = 'all', now = Date.now()): Order[] {
  const days = PERIOD_DAYS[period];
  const since = days === null ? '' : new Date(now - days * DAY).toISOString();
  return db.orders.filter((o) => filter(o) && o.createdAt >= since && !cancelledKeys(o.vendorOrgId).has(o.statusKey));
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Month buckets, oldest first, including empty months so charts have no gaps. */
function byMonth(orders: Order[], months: number, now = new Date(), value: (o: Order) => number = orderTotal): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({ period: d.toISOString().slice(0, 7), revenue: 0, orderCount: 0 });
  }
  for (const o of orders) {
    const b = buckets.find((x) => x.period === monthKey(o.createdAt));
    if (!b) continue;
    b.revenue = roundMoney(b.revenue + value(o));
    b.orderCount += 1;
  }
  return buckets;
}

function monthsFor(period: StatsPeriod | undefined): number {
  return period === '30d' ? 2 : period === '90d' ? 3 : 12;
}

export const statsService: StatsService = {
  async getVendorSummary(vendorOrgId) {
    await delay();
    const org = findOrThrow(db.vendorOrgs, (o) => o.id === vendorOrgId, 'Vendor');
    const config = findOrThrow(db.statusConfigs, (c) => c.vendorOrgId === vendorOrgId, 'Order status configuration');
    const terminal = new Set(config.statuses.filter((s) => s.isTerminal).map((s) => s.key));
    const all = db.orders.filter((o) => o.vendorOrgId === vendorOrgId);
    const last30 = countedOrders((o) => o.vendorOrgId === vendorOrgId, '30d');
    return clone({
      vendorOrgId,
      revenueLast30d: roundMoney(last30.reduce((s, o) => s + orderTotal(o), 0)),
      ordersLast30d: last30.length,
      openOrders: all.filter((o) => !terminal.has(o.statusKey)).length,
      activeBuyers: db.relations.filter((r) => r.vendorOrgId === vendorOrgId && r.status === 'active').length,
      revenueByMonth: byMonth(countedOrders((o) => o.vendorOrgId === vendorOrgId, '12m'), 6),
      recentOrders: [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
      lowStockProducts: org.tracksInventory
        ? db.products.filter((p) => p.vendorOrgId === vendorOrgId && p.isActive && p.stock !== undefined && p.stock <= LOW_STOCK_THRESHOLD)
        : [],
    });
  },

  async byProduct(vendorOrgId, filter = {}) {
    await delay();
    const orders = countedOrders(
      (o) => o.vendorOrgId === vendorOrgId && (!filter.locationId || o.fulfillingLocationId === filter.locationId),
      filter.period,
    );
    const stats = new Map<string, ProductStat>();
    for (const o of orders) {
      for (const item of o.items) {
        const product = db.products.find((p) => p.id === item.productId);
        let s = stats.get(item.productId);
        if (!s) {
          s = {
            productId: item.productId,
            productName: product?.name ?? 'Deleted product',
            sku: product?.sku ?? '—',
            unit: product?.unit ?? '',
            units: 0,
            revenue: 0,
            orderCount: 0,
            trend: [],
          };
          stats.set(item.productId, s);
        }
        s.units += item.quantity;
        s.revenue = roundMoney(s.revenue + item.quantity * item.priceAtOrder);
        s.orderCount += 1;
      }
    }
    const months = monthsFor(filter.period);
    for (const s of stats.values()) {
      const withProduct = orders.filter((o) => o.items.some((i) => i.productId === s.productId));
      s.trend = byMonth(withProduct, months, new Date(), (o) =>
        o.items.filter((i) => i.productId === s.productId).reduce((t, i) => t + i.quantity * i.priceAtOrder, 0),
      );
    }
    return [...stats.values()].sort((a, b) => b.revenue - a.revenue);
  },

  async byBuyer(vendorOrgId, filter = {}) {
    await delay();
    const orders = countedOrders(
      (o) => o.vendorOrgId === vendorOrgId && (!filter.locationId || o.fulfillingLocationId === filter.locationId),
      filter.period,
    );
    const connected = db.relations.filter((r) => r.vendorOrgId === vendorOrgId && r.status === 'active');
    return connected
      .map((r) => {
        const mine = orders.filter((o) => o.buyerOrgId === r.buyerOrgId);
        return {
          buyerOrgId: r.buyerOrgId,
          buyerName: db.buyerOrgs.find((b) => b.id === r.buyerOrgId)?.name ?? 'Unknown buyer',
          orderCount: mine.length,
          spend: roundMoney(mine.reduce((s, o) => s + orderTotal(o), 0)),
          lastOrderAt: mine.map((o) => o.createdAt).sort().at(-1),
        };
      })
      .sort((a, b) => b.spend - a.spend);
  },

  async getBuyerSummary(buyerOrgId, vendorOrgId, filter = {}) {
    await delay();
    const orders = countedOrders(
      (o) => o.buyerOrgId === buyerOrgId && o.vendorOrgId === vendorOrgId && (!filter.locationId || o.locationId === filter.locationId),
      filter.period,
    );
    const byProduct = new Map<string, { productId: string; productName: string; units: number; spend: number }>();
    for (const o of orders) {
      for (const i of o.items) {
        const row = byProduct.get(i.productId) ?? {
          productId: i.productId,
          productName: db.products.find((p) => p.id === i.productId)?.name ?? 'Deleted product',
          units: 0,
          spend: 0,
        };
        row.units += i.quantity;
        row.spend = roundMoney(row.spend + i.quantity * i.priceAtOrder);
        byProduct.set(i.productId, row);
      }
    }
    return {
      buyerOrgId,
      vendorOrgId,
      totalSpend: roundMoney(orders.reduce((s, o) => s + orderTotal(o), 0)),
      orderCount: orders.length,
      byProduct: [...byProduct.values()].sort((a, b) => b.spend - a.spend),
      byPeriod: byMonth(orders, monthsFor(filter.period)),
    };
  },

  async getMostOrdered(buyerOrgId, vendorOrgId, limit = 8) {
    await delay();
    const orders = countedOrders((o) => o.buyerOrgId === buyerOrgId && o.vendorOrgId === vendorOrgId);
    const tally = new Map<string, { totalQuantity: number; orderCount: number }>();
    for (const o of orders) {
      for (const i of o.items) {
        const t = tally.get(i.productId) ?? { totalQuantity: 0, orderCount: 0 };
        t.totalQuantity += i.quantity;
        t.orderCount += 1;
        tally.set(i.productId, t);
      }
    }
    const items: MostOrderedItem[] = [];
    for (const [productId, t] of tally) {
      const product = db.products.find((p) => p.id === productId && p.isActive);
      if (product) items.push({ product, ...t });
    }
    // Frequency first (how habitual), then volume.
    items.sort((a, b) => b.orderCount - a.orderCount || b.totalQuantity - a.totalQuantity);
    return clone(items.slice(0, limit));
  },
};
