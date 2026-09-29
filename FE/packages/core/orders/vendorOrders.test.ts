import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnglish as en } from '../i18n/message';
import { createServices } from '../serviceProvider';
import { db, resetMockDb } from '../mocks/db';
import { setMockLatency } from '../mocks/util';
import { DEFAULT_ORDER_STATUSES } from '../constants';
import {
  cancelledStatus,
  isOpenOrder,
  loadBuyerDetail,
  loadBuyerRows,
  loadVendorOrderContext,
  moveStatus,
  nextStatus,
  statusKeyFromLabel,
  statusListProblems,
} from './vendorOrders';

setMockLatency(0);
const s = createServices(true);
beforeEach(() => resetMockDb());
const cleanpro = () => db.statusConfigs.find((c) => c.vendorOrgId === 'vo_cleanpro')!;

test('next status follows the vendor’s own order; none once terminal or cancelled', () => {
  assert.equal(nextStatus(cleanpro(), 'received')?.key, 'picking');
  assert.equal(nextStatus(cleanpro(), 'out_for_delivery')?.key, 'delivered');
  assert.equal(nextStatus(cleanpro(), 'delivered'), undefined);
  assert.equal(nextStatus(cleanpro(), 'cancelled'), undefined);
  assert.equal(cancelledStatus(cleanpro())?.key, 'cancelled');
  assert.equal(isOpenOrder(cleanpro(), { statusKey: 'picking' }), true);
  assert.equal(isOpenOrder(cleanpro(), { statusKey: 'delivered' }), false);
});

test('status keys from labels are slugged, diacritics folded, and unique', () => {
  assert.equal(statusKeyFromLabel('Out for delivery', []), 'out_for_delivery');
  assert.equal(statusKeyFromLabel('Isporučeno', []), 'isporuceno');
  assert.equal(statusKeyFromLabel('Placed', ['placed']), 'placed_2');
  assert.equal(statusKeyFromLabel('!!!', []), 'status');
});

test('status list problems mirror the service rules', () => {
  assert.deepEqual(statusListProblems(DEFAULT_ORDER_STATUSES), []);
  const noCancel = DEFAULT_ORDER_STATUSES.filter((x) => !x.isCancelled);
  assert.match(statusListProblems(noCancel).map(en).join(' '), /cancelled status/);
  const terminalFirst = moveStatus(DEFAULT_ORDER_STATUSES, 2, -1).reverse();
  assert.match(statusListProblems(terminalFirst).map(en).join(' '), /first status/);
  assert.match(statusListProblems([...DEFAULT_ORDER_STATUSES, { key: 'x', label: 'placed', isTerminal: false, isCancelled: false }]).map(en).join(' '), /same name/);
});

test('moveStatus swaps neighbours and ignores out-of-range moves', () => {
  const moved = moveStatus(DEFAULT_ORDER_STATUSES, 1, -1);
  assert.deepEqual(moved.map((x) => x.key), ['confirmed', 'placed', 'fulfilled', 'cancelled']);
  assert.equal(moveStatus(DEFAULT_ORDER_STATUSES, 0, -1), DEFAULT_ORDER_STATUSES);
});

test('order context labels buyers, delivery locations, users and products', async () => {
  const ctx = await loadVendorOrderContext(s, 'vo_papirko');
  assert.equal(ctx.buyers.get('bo_aurora')?.name, 'Hotel Aurora Group');
  assert.equal(ctx.buyerLocations.get('loc_aurora_river')?.name, 'Aurora Riverside');
  assert.equal(ctx.buyerUsers.get('bu_milica')?.name, 'Milica Stanković');
  assert.equal(ctx.vendorUsers.get('vu_marko')?.name, 'Marko Petrović');
  assert.ok(ctx.products.get('p_glv_vinyl'), 'inactive products included for history');
});

test('buyer rows: connected, invited existing org, invite to a new buyer', async () => {
  const papirko = await loadBuyerRows(s, 'vo_papirko');
  assert.deepEqual(papirko.map((r) => `${r.kind}:${r.name}`), [
    'connected:Café Lipa',
    'connected:Hotel Aurora Group',
    'connected:Kindergarten Sunce',
    'pendingInvite:nabavka@hostelmost.rs',
  ]);
  assert.ok(papirko[1]!.stats && papirko[1]!.stats.orderCount > 0);
  const cleanproRows = await loadBuyerRows(s, 'vo_cleanpro');
  assert.ok(cleanproRows.some((r) => r.kind === 'invited' && r.name === 'Café Lipa' && r.invite?.email === 'nikola@cafelipa.rs'));
});

test('buyer detail: overrides with product names, orders with this vendor only', async () => {
  const d = await loadBuyerDetail(s, 'vo_papirko', 'bo_aurora');
  assert.deepEqual(d.overrides.map((o) => o.product?.name), ['Foam hand soap, 5 L', 'Toilet paper 3-ply, 48 rolls']);
  assert.ok(d.orders.length > 0 && d.orders.every((o) => o.vendorOrgId === 'vo_papirko' && o.buyerOrgId === 'bo_aurora'));
});

test('order date ranges: "all" has no start; N days counts back from now', async () => {
  const { orderRangeStart } = await import('./vendorOrders');
  const now = new Date('2026-09-28T12:00:00Z');
  assert.equal(orderRangeStart('all', now), undefined);
  assert.equal(orderRangeStart('7', now), '2026-09-21T12:00:00.000Z');
});
