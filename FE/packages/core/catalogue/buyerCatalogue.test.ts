import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServices } from '../serviceProvider';
import { db, resetMockDb } from '../mocks/db';
import { setMockLatency } from '../mocks/util';
import { loadBuyerCatalogue, loadBuyerShelves, loadCartPricing, loadProductDetail, normalizeQuantity } from './buyerCatalogue';

setMockLatency(0);
const s = createServices(true);
const scope = { vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_aurora' };
beforeEach(() => resetMockDb());

test('buyer catalogue hides inactive products and prices at the minimum order quantity', async () => {
  const items = await loadBuyerCatalogue(s, scope);
  assert.ok(!items.some((i) => i.product.id === 'p_glv_vinyl'), 'inactive product hidden');
  const sanitizer = items.find((i) => i.product.id === 'p_soap_sanit')!;
  assert.equal(sanitizer.price.quantity, 6);
  const soap = items.find((i) => i.product.id === 'p_soap_foam5')!;
  assert.equal(soap.price.source, 'override');
});

test('shelves: featured in vendor order, most-ordered from history, inactive dropped', async () => {
  db.products.find((p) => p.id === 'p_nap_dinner')!.isActive = false;
  const { featured, mostOrdered } = await loadBuyerShelves(s, scope);
  assert.deepEqual(featured.map((f) => f.product.id), ['p_tw_zfold', 'p_tp_recycled']);
  assert.ok(mostOrdered.length > 3 && mostOrdered.every((m) => m.product.id !== 'p_nap_dinner'));
});

test('product detail: tier table resolved per tier; another vendor’s product is null', async () => {
  const detail = await loadProductDetail(s, { ...scope, productId: 'p_tw_zfold' });
  assert.deepEqual(detail!.tierPrices.map((t) => [t.quantity, t.unitPrice]), [[10, 42.1], [50, 38.9]]);
  assert.equal(await loadProductDetail(s, { ...scope, productId: 'p_cp_dish' }), null);
});

test('cart pricing re-resolves by quantity and flags unavailable / below-minimum lines', async () => {
  db.products.find((p) => p.id === 'p_bag_60')!.isActive = false;
  const { rows, total, itemCount } = await loadCartPricing(s, {
    ...scope,
    lines: [
      { productId: 'p_tw_zfold', quantity: 50 },
      { productId: 'p_soap_sanit', quantity: 2 },
      { productId: 'p_bag_60', quantity: 3 },
    ],
  });
  assert.equal(rows[0]!.price!.unitPrice, 38.9);
  assert.equal(rows[1]!.belowMinimum, true);
  assert.equal(rows[2]!.product, undefined);
  assert.equal(itemCount, 52);
  assert.equal(total, Math.round((50 * 38.9 + 2 * 12.5) * 100) / 100);
});

test('normalizeQuantity clamps to the minimum order', () => {
  assert.equal(normalizeQuantity(2, { minOrderQuantity: 6 }), 6);
  assert.equal(normalizeQuantity(7.8, {}), 7);
  assert.equal(normalizeQuantity(0, { minOrderQuantity: 6 }), 0);
});
