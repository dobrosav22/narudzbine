import { formatNumber } from '../helpers';
import type { OrdersService, OrderStatusConfigService } from '../services';
import type { Order, OrderMessage } from '../types';
import { serviceError } from '../errors';
import { db } from './db';
import { resolveFromDb } from './pricing';
import { clone, delay, findOrThrow, newId, nowIso } from './util';

function statusConfig(vendorOrgId: string) {
  return findOrThrow(db.statusConfigs, (c) => c.vendorOrgId === vendorOrgId, 'Order status configuration');
}

export const ordersService: OrdersService = {
  async listOrders({ vendorOrgId, buyerOrgId, locationId, statusKey, from, to }) {
    await delay();
    return clone(
      db.orders
        .filter((o) => !vendorOrgId || o.vendorOrgId === vendorOrgId)
        .filter((o) => !buyerOrgId || o.buyerOrgId === buyerOrgId)
        // locationId matches either side: buyer delivery location or vendor fulfilling location.
        .filter((o) => !locationId || o.locationId === locationId || o.fulfillingLocationId === locationId)
        .filter((o) => !statusKey || o.statusKey === statusKey)
        .filter((o) => !from || o.createdAt >= from)
        .filter((o) => !to || o.createdAt <= to)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  },

  async getOrder(orderId) {
    await delay();
    return clone(findOrThrow(db.orders, (o) => o.id === orderId, 'Order'));
  },

  async createOrder(input) {
    await delay(400);
    const { vendorOrgId, buyerOrgId } = input;
    const relation = db.relations.find((r) => r.vendorOrgId === vendorOrgId && r.buyerOrgId === buyerOrgId && r.status === 'active');
    if (!relation) throw serviceError('UNAUTHORIZED', 'errors.notConnected');
    findOrThrow(db.locations, (l) => l.id === input.locationId && l.buyerOrgId === buyerOrgId, 'Delivery location');
    const lines = input.items.filter((i) => i.quantity > 0);
    if (lines.length === 0) throw serviceError('VALIDATION', 'errors.cartEmpty');

    // Continue the seed's numbering (ord_1000…) so mock order numbers look like real ones.
    const nextNumber = 1 + Math.max(999, ...db.orders.map((o) => Number(o.id.slice(4))).filter(Number.isFinite));
    const id = `ord_${nextNumber}`;
    const items = lines.map((line) => {
      const product = findOrThrow(db.products, (p) => p.id === line.productId && p.vendorOrgId === vendorOrgId, 'Product');
      if (!product.isActive) throw serviceError('VALIDATION', 'errors.productUnavailable', { product: product.name }, { productId: product.id });
      if (product.minOrderQuantity && line.quantity < product.minOrderQuantity)
        throw serviceError('VALIDATION', 'errors.belowMinimum', { product: product.name, min: formatNumber(product.minOrderQuantity ?? 1) }, { productId: product.id });
      const price = resolveFromDb(vendorOrgId, buyerOrgId, product.id, line.quantity);
      return { id: newId('oi'), orderId: id, productId: product.id, quantity: line.quantity, priceAtOrder: price.unitPrice };
    });

    // Stock is informational only — orders are never blocked on it [assumed]; decrement if tracked.
    for (const item of items) {
      const p = db.products.find((x) => x.id === item.productId)!;
      if (p.stock !== undefined) p.stock = Math.max(0, p.stock - item.quantity);
    }

    const now = nowIso();
    const order: Order = {
      id,
      vendorOrgId,
      buyerOrgId,
      locationId: input.locationId,
      fulfillingLocationId: input.fulfillingLocationId,
      createdByUserId: input.createdByUserId,
      statusKey: statusConfig(vendorOrgId).statuses[0]!.key,
      items,
      createdAt: now,
      updatedAt: now,
    };
    db.orders.unshift(order);
    if (input.fromDraftCartId) db.draftCarts = db.draftCarts.filter((d) => d.id !== input.fromDraftCartId);
    return clone(order);
  },

  async updateOrderStatus(orderId, statusKey) {
    await delay();
    const order = findOrThrow(db.orders, (o) => o.id === orderId, 'Order');
    if (!statusConfig(order.vendorOrgId).statuses.some((s) => s.key === statusKey))
      throw serviceError('VALIDATION', 'errors.unknownStatus', { status: statusKey });
    order.statusKey = statusKey;
    order.updatedAt = nowIso();
    return clone(order);
  },

  async listOrderMessages(orderId) {
    await delay();
    return clone(db.messages.filter((m) => m.orderId === orderId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  },

  async addOrderMessage(orderId, { senderUserId, senderOrgType, text }) {
    await delay();
    findOrThrow(db.orders, (o) => o.id === orderId, 'Order');
    if (!text.trim()) throw serviceError('VALIDATION', 'errors.messageEmpty');
    const message: OrderMessage = { id: newId('msg'), orderId, senderUserId, senderOrgType, text: text.trim(), createdAt: nowIso() };
    db.messages.push(message);
    return clone(message);
  },

  async reorder(orderId) {
    await delay();
    const order = findOrThrow(db.orders, (o) => o.id === orderId, 'Order');
    const available = order.items.filter((i) => db.products.some((p) => p.id === i.productId && p.isActive));
    return {
      sourceOrderId: order.id,
      vendorOrgId: order.vendorOrgId,
      locationId: order.locationId,
      items: available.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      unavailableProductIds: order.items.filter((i) => !available.includes(i)).map((i) => i.productId),
    };
  },
};

export const orderStatusConfigService: OrderStatusConfigService = {
  async get(vendorOrgId) {
    await delay();
    return clone(statusConfig(vendorOrgId));
  },
  async update(vendorOrgId, statuses) {
    await delay();
    const config = statusConfig(vendorOrgId);
    const keys = statuses.map((s) => s.key.trim());
    if (statuses.length < 2) throw serviceError('VALIDATION', 'errors.statusesTooFew');
    if (keys.some((k) => !k) || statuses.some((s) => !s.label.trim())) throw serviceError('VALIDATION', 'errors.statusNeedsLabel');
    if (new Set(keys).size !== keys.length) throw serviceError('VALIDATION', 'errors.statusKeysUnique');
    if (statuses[0]!.isTerminal) throw serviceError('VALIDATION', 'errors.firstStatusTerminal');
    if (!statuses.some((s) => s.isCancelled)) throw serviceError('VALIDATION', 'errors.needsCancelled');
    if (!statuses.some((s) => s.isTerminal && !s.isCancelled)) throw serviceError('VALIDATION', 'errors.needsCompleted');
    const inUse = new Set(db.orders.filter((o) => o.vendorOrgId === vendorOrgId).map((o) => o.statusKey));
    const removedInUse = [...inUse].filter((k) => !keys.includes(k));
    if (removedInUse.length)
      throw serviceError('VALIDATION', 'errors.statusInUse', { statuses: removedInUse.join(', ') }, { keys: removedInUse });
    config.statuses = statuses.map((s) => ({ ...s, key: s.key.trim(), label: s.label.trim(), isTerminal: s.isTerminal || s.isCancelled }));
    return clone(config);
  },
};
