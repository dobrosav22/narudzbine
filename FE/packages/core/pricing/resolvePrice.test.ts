import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePrice } from './resolvePrice';
import type { Product, PriceTier, BuyerProductPrice, Promotion } from '../types';

const now = new Date('2026-09-27T12:00:00Z');
const product: Product = {
  id: 'p1', vendorOrgId: 'v1', name: 'Towels', sku: 'T-1', categoryId: 'c1',
  tagIds: [], basePrice: 10, unit: 'case', isActive: true,
};
const tiers: PriceTier[] = [
  { id: 't1', productId: 'p1', minQty: 10, pricePerUnit: 9 },
  { id: 't2', productId: 'p1', minQty: 50, pricePerUnit: 8 },
];
const overrides: BuyerProductPrice[] = [
  { id: 'o1', vendorOrgId: 'v1', buyerOrgId: 'b1', productId: 'p1', price: 7.5 },
];
const promo = (over: Partial<Promotion>): Promotion => ({
  id: 'pr', vendorOrgId: 'v1', type: 'percentage', value: 10, scope: 'all', scopeIds: [],
  startDate: '2026-09-01T00:00:00Z', endDate: '2026-10-31T00:00:00Z', isActive: true, ...over,
});
const base = { product, tiers, overrides: [], promotions: [], now };

test('base price below first tier', () => {
  const r = resolvePrice({ ...base, quantity: 3 });
  assert.equal(r.unitPrice, 10);
  assert.equal(r.source, 'base');
  assert.equal(r.lineTotal, 30);
});

test('highest reached tier wins', () => {
  assert.equal(resolvePrice({ ...base, quantity: 10 }).unitPrice, 9);
  assert.equal(resolvePrice({ ...base, quantity: 49 }).unitPrice, 9);
  const r = resolvePrice({ ...base, quantity: 50 });
  assert.equal(r.unitPrice, 8);
  assert.equal(r.appliedTier?.id, 't2');
});

test('buyer override beats tiers, only for that buyer', () => {
  const r = resolvePrice({ ...base, overrides, buyerOrgId: 'b1', quantity: 100 });
  assert.equal(r.unitPrice, 7.5);
  assert.equal(r.source, 'override');
  assert.equal(resolvePrice({ ...base, overrides, buyerOrgId: 'b2', quantity: 100 }).unitPrice, 8);
});

test('promotion applies on top of override', () => {
  const r = resolvePrice({ ...base, overrides, buyerOrgId: 'b1', quantity: 1, promotions: [promo({})] });
  assert.equal(r.preDiscountUnitPrice, 7.5);
  assert.equal(r.unitPrice, 6.75);
  assert.equal(r.appliedPromotion?.id, 'pr');
});

test('best single promotion wins, no stacking; fixed never below zero', () => {
  const r = resolvePrice({
    ...base, quantity: 1,
    promotions: [promo({ id: 'a', value: 10 }), promo({ id: 'b', type: 'fixed', value: 3 })],
  });
  assert.equal(r.unitPrice, 7);
  assert.equal(r.appliedPromotion?.id, 'b');
  assert.equal(resolvePrice({ ...base, quantity: 1, promotions: [promo({ type: 'fixed', value: 99 })] }).unitPrice, 0);
});

test('best promotion = lowest resulting price, never the larger raw value (04, resolved 2026-09)', () => {
  const pick = (price: number, promos: Promotion[]) =>
    resolvePrice({ ...base, product: { ...product, basePrice: price }, tiers: [], quantity: 1, promotions: promos });
  const pct20 = promo({ id: 'pct20', type: 'percentage', value: 20 });
  const flat3 = promo({ id: 'flat3', type: 'fixed', value: 3 });
  // On a cheap item the flat amount wins (10 → 7 beats 10 → 8) despite 3 < 20…
  assert.equal(pick(10, [pct20, flat3]).appliedPromotion?.id, 'flat3');
  assert.equal(pick(10, [pct20, flat3]).unitPrice, 7);
  // …on an expensive item the percentage wins (100 → 80 beats 100 → 97). Order of the list is irrelevant.
  assert.equal(pick(100, [flat3, pct20]).appliedPromotion?.id, 'pct20');
  assert.equal(pick(100, [flat3, pct20]).unitPrice, 80);
});

test('scope, date, active flag and vendor are all respected', () => {
  const q = { ...base, quantity: 1, buyerOrgId: 'b1' };
  assert.equal(resolvePrice({ ...q, promotions: [promo({ scope: 'category', scopeIds: ['c2'] })] }).unitPrice, 10);
  assert.equal(resolvePrice({ ...q, promotions: [promo({ scope: 'category', scopeIds: ['c1'] })] }).unitPrice, 9);
  assert.equal(resolvePrice({ ...q, promotions: [promo({ scope: 'product', scopeIds: ['p1'] })] }).unitPrice, 9);
  assert.equal(resolvePrice({ ...q, promotions: [promo({ scope: 'buyer', scopeIds: ['b1'] })] }).unitPrice, 9);
  assert.equal(resolvePrice({ ...q, buyerOrgId: undefined, promotions: [promo({ scope: 'buyer', scopeIds: ['b1'] })] }).unitPrice, 10);
  assert.equal(resolvePrice({ ...q, promotions: [promo({ isActive: false })] }).unitPrice, 10);
  assert.equal(resolvePrice({ ...q, promotions: [promo({ endDate: '2026-09-01T00:00:00Z' })] }).unitPrice, 10);
  assert.equal(resolvePrice({ ...q, promotions: [promo({ vendorOrgId: 'v2' })] }).unitPrice, 10);
});

test('roundMoney: exact half-cents round up despite float error (regression)', async () => {
  const { roundMoney } = await import('./resolvePrice');
  assert.equal(42.1 * 0.95, 39.994999999999997); // the float the old EPSILON trick rounded down
  assert.equal(roundMoney(42.1 * 0.95), 40);
  assert.equal(roundMoney(12.5 * 0.95), 11.88);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(19.994), 19.99);
  assert.equal(roundMoney(-1.005), -1.01);
  assert.equal(roundMoney(0), 0);
});
