import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnglish as en } from '../i18n/message';
import { createServices } from '../serviceProvider';
import { db, resetMockDb } from '../mocks/db';
import { setMockLatency } from '../mocks/util';
import { loadCartPricing } from '../catalogue/buyerCatalogue';
import { trackerView, orderNumber } from '../orders/view';
import { createCartStore } from './store';
import { applyReorder, checkoutProblems, defaultLocationId, parkCart, placeOrder, resumeDraft } from './checkout';
import type { KeyValueStorage } from '../session/store';

setMockLatency(0);
const s = createServices(true);
const scope = { buyerOrgId: 'bo_aurora', vendorOrgId: 'vo_papirko' };
const memory = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
};
beforeEach(() => resetMockDb());

test('default location: home if it exists, else first', () => {
  const locs = db.locations.filter((l) => l.buyerOrgId === 'bo_aurora');
  assert.equal(defaultLocationId(locs, 'loc_aurora_river'), 'loc_aurora_river');
  assert.equal(defaultLocationId(locs, 'gone'), locs[0]!.id);
  assert.equal(defaultLocationId([], 'x'), undefined);
});

test('checkout problems: empty, unavailable, below minimum, no location', async () => {
  const locations = db.locations.filter((l) => l.buyerOrgId === 'bo_aurora');
  assert.deepEqual(checkoutProblems({ rows: [], locationId: 'loc_aurora_central', locations }).map(en), ['Your cart is empty.']);
  db.products.find((p) => p.id === 'p_bag_60')!.isActive = false;
  const { rows } = await loadCartPricing(s, { ...scope, lines: [{ productId: 'p_soap_sanit', quantity: 2 }, { productId: 'p_bag_60', quantity: 1 }] });
  const problems = checkoutProblems({ rows, locationId: undefined, locations });
  assert.equal(problems.length, 3);
  assert.match(problems.map(en).join(' '), /no longer available/);
  assert.match(problems.map(en).join(' '), /minimum order of 6/);
  assert.match(problems.map(en).join(' '), /delivery location/);
});

test('park → resume → place: draft is updated, then removed by the order', async () => {
  const store = createCartStore(memory());
  store.add(scope, 'p_tw_zfold', 10);
  store.setLocation(scope, 'loc_aurora_river');
  const draft = await parkCart(s, store, scope, 'bu_milica');
  assert.deepEqual(store.getLines(scope), []);
  assert.equal(store.getState(scope).locationId, 'loc_aurora_river', 'location kept after parking');

  resumeDraft(store, scope, draft);
  store.add(scope, 'p_bag_120', 12);
  const again = await parkCart(s, store, scope, 'bu_milica');
  assert.equal(again.id, draft.id, 'resumed draft is updated, not duplicated');
  assert.equal(again.items.length, 2);

  resumeDraft(store, scope, again);
  const order = await placeOrder(s, store, scope, { createdByUserId: 'bu_milica', locationId: 'loc_aurora_river' });
  assert.equal(order.statusKey, 'placed');
  assert.equal(order.items.find((i) => i.productId === 'p_tw_zfold')?.priceAtOrder, 42.1); // tier at 10
  assert.ok(!db.draftCarts.some((d) => d.id === draft.id), 'draft removed once ordered');
  assert.deepEqual(store.getState(scope), { lines: [], locationId: 'loc_aurora_river' });
});

test('reorder fills a fresh cart for the same location, skipping unavailable products', async () => {
  const store = createCartStore(memory());
  store.add(scope, 'p_glv_nitrile', 99);
  const past = db.orders.find((o) => o.buyerOrgId === 'bo_aurora' && o.vendorOrgId === 'vo_papirko')!;
  const gone = past.items[0]!.productId;
  db.products.find((p) => p.id === gone)!.isActive = false;
  const result = await s.orders.reorder(past.id);
  applyReorder(store, scope, result);
  assert.deepEqual(result.unavailableProductIds, [gone]);
  assert.equal(store.getLines(scope).length, past.items.length - 1);
  assert.equal(store.getState(scope).locationId, past.locationId);
});

test('tracker follows the vendor’s own statuses; cancelled is flagged', () => {
  const cleanpro = db.statusConfigs.find((c) => c.vendorOrgId === 'vo_cleanpro')!;
  const t = trackerView(cleanpro, 'picking');
  assert.deepEqual(t.steps.map((x) => `${x.status.key}:${x.state}`), ['received:done', 'picking:current', 'out_for_delivery:upcoming', 'delivered:upcoming']);
  const c = trackerView(cleanpro, 'cancelled');
  assert.equal(c.cancelled?.label, 'Cancelled');
  assert.ok(c.steps.every((x) => x.state === 'upcoming'));
  assert.equal(orderNumber({ id: 'ord_1001' }), '1001');
});

test('cart store reads Phase 3’s persisted array shape', async () => {
  const storage = memory();
  await storage.setItem('narudzbine.cart.bo_aurora.vo_papirko', JSON.stringify([{ productId: 'p1', quantity: 2 }]));
  const store = createCartStore(storage);
  await store.hydrate(scope);
  assert.deepEqual(store.getState(scope), { lines: [{ productId: 'p1', quantity: 2 }] });
});
