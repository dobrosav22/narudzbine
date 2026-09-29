import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnglish as en } from '../i18n/message';
import {
  emptyProductDraft,
  parseDecimal,
  productToDraft,
  toDecimalInput,
  validateProductDraft,
  validateTierDrafts,
} from './productForm';
import type { Product } from '../types';

test('parseDecimal accepts bs-BA and en input', () => {
  assert.equal(parseDecimal('19,60'), 19.6);
  assert.equal(parseDecimal('19.60'), 19.6);
  assert.equal(parseDecimal('1.234,50'), 1234.5);
  assert.equal(parseDecimal('1 234,50'), 1234.5);
  assert.equal(parseDecimal('1.234.567'), 1234567);
  assert.equal(parseDecimal(' 7 '), 7);
  assert.equal(parseDecimal(''), undefined);
  assert.equal(parseDecimal('abc'), undefined);
  assert.equal(parseDecimal('1,2,3'), undefined);
});

test('toDecimalInput round-trips through parseDecimal in bs-BA', () => {
  assert.equal(toDecimalInput(1234.5), '1234,50');
  assert.equal(parseDecimal(toDecimalInput(1234.5)), 1234.5);
});

const product: Product = {
  id: 'p', vendorOrgId: 'v', name: 'Towels', sku: 'T-1', tagIds: ['t1'], basePrice: 44.6, unit: 'case', stock: 12, isActive: true,
};

test('draft round trip for a tracking vendor', () => {
  const d = productToDraft(product);
  assert.equal(d.basePrice, '44,60');
  const r = validateProductDraft(d, { tracksInventory: true });
  assert.ok(r.ok);
  assert.equal(r.value.basePrice, 44.6);
  assert.equal(r.value.stock, 12);
});

test('non-tracking vendor never sends stock; blank stock is 0 when tracking', () => {
  const d = { ...emptyProductDraft(), name: 'X', sku: 'X', unit: 'pc', basePrice: '5', stock: '99' };
  const off = validateProductDraft(d, { tracksInventory: false });
  assert.ok(off.ok && !('stock' in off.value));
  const on = validateProductDraft({ ...d, stock: '' }, { tracksInventory: true });
  assert.ok(on.ok && on.value.stock === 0);
});

test('field errors', () => {
  const r = validateProductDraft(
    { ...emptyProductDraft(), basePrice: 'x', minOrderQuantity: '0', stock: '-1' },
    { tracksInventory: true },
  );
  assert.ok(!r.ok);
  assert.deepEqual(Object.keys(r.errors).sort(), ['basePrice', 'minOrderQuantity', 'name', 'sku', 'stock', 'unit']);
});

test('tiers: sorted, blanks ignored, locale decimals', () => {
  const r = validateTierDrafts(
    [{ minQty: '50', pricePerUnit: '38,90' }, { minQty: '', pricePerUnit: '' }, { minQty: '10', pricePerUnit: '42.10' }],
    44.6,
  );
  assert.ok(r.ok);
  assert.deepEqual(r.value, [{ minQty: 10, pricePerUnit: 42.1 }, { minQty: 50, pricePerUnit: 38.9 }]);
});

test('tiers: errors land on the offending row', () => {
  const r = validateTierDrafts(
    [
      { minQty: '1', pricePerUnit: '5' },
      { minQty: '10', pricePerUnit: '50' },
      { minQty: '20', pricePerUnit: '30' },
      { minQty: '20', pricePerUnit: '29' },
      { minQty: '40', pricePerUnit: '35' },
    ],
    44.6,
  );
  assert.ok(!r.ok);
  assert.match(en(r.errors[0]!), /2 or more/);
  assert.match(en(r.errors[1]!), /base price/);
  assert.equal(r.errors[2], undefined);
  assert.match(en(r.errors[3]!), /already starts at 20/);
  assert.match(en(r.errors[4]!), /20\+ tier/);
});
