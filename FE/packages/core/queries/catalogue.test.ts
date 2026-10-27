import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bulkPercentResult,
  parseDeltaInput,
  parsePercentChangeInput,
  parsePriceInput,
  parseQuantityInput,
  pricingUnchanged,
  priceToInput,
  validatePricingDraft,
  validateProductDraft,
  emptyProductDraft,
} from './catalogue';
import { localTimeInstant, promotionActions, toCountryLocalInput, toCountryLocalTime, validatePromotionDraft, emptyPromotionDraft } from './promotions';
import type { Promotion } from '../api/models';

test('price input: locale separators in, exact contract strings out, never rounded', () => {
  assert.equal(parsePriceInput('19,6'), '19.60');
  assert.equal(parsePriceInput('1.234,50'), '1234.50');
  assert.equal(parsePriceInput('12.5'), '12.50');
  assert.equal(parsePriceInput(' 007 '), '7.00');
  assert.equal(parsePriceInput(''), undefined);
  assert.equal(parsePriceInput('1,234'), null); // three decimals
  assert.equal(parsePriceInput('-1'), null);
  assert.equal(parsePriceInput('0'), null);
  assert.equal(parsePriceInput('0', { allowZero: true }), '0.00');
  assert.equal(parsePriceInput('999999999,99'), '999999999.99');
  assert.equal(parsePriceInput('1000000000'), null);
  assert.equal(priceToInput('1234.50'), '1234,50');
});

test('quantities and deltas are whole and bounded', () => {
  assert.equal(parseQuantityInput('6'), 6);
  assert.equal(parseQuantityInput('0'), null);
  assert.equal(parseQuantityInput('0', 0), 0);
  assert.equal(parseQuantityInput('1,5'), null);
  assert.equal(parseDeltaInput('-3'), -3);
  assert.equal(parseDeltaInput('+24'), 24);
  assert.equal(parseDeltaInput('0'), null);
});

test('bulk percent change rounds half-up to two decimals like the backend', () => {
  assert.equal(parsePercentChangeInput('-10'), '-10.00');
  assert.equal(parsePercentChangeInput('-100'), null);
  assert.equal(parsePercentChangeInput('1000'), '1000.00');
  assert.equal(parsePercentChangeInput('1000,01'), null);
  assert.equal(bulkPercentResult('100.00', '5.00'), '105.00');
  assert.equal(bulkPercentResult('0.85', '-10.00'), '0.77'); // 0.765 → 0.77
  assert.equal(bulkPercentResult('0.01', '-99.99'), null); // rounds to zero
});

test('product draft validation follows contract limits', () => {
  const d = { ...emptyProductDraft(), sku: 'BAG-1', name: ' Flour ', quantityStep: '6', minimumQuantity: '6' };
  const ok = validateProductDraft(d);
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value, { sku: 'BAG-1', name: 'Flour', description: null, unitId: null, packDescription: null, categoryId: null, tagIds: [], minimumQuantity: 6, quantityStep: 6 });
  const bad = validateProductDraft({ ...d, sku: 'bad sku', minimumQuantity: '0' });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['minimumQuantity', 'sku']);
});

test('tiers: above minimum, on a step, strictly decreasing below base', () => {
  const rules = { minimumQuantity: 6, quantityStep: 6 };
  const ok = validatePricingDraft({ basePrice: '1,00', tiers: [{ minimumQuantity: '24', unitPrice: '0,90' }, { minimumQuantity: '12', unitPrice: '0,95' }] }, rules);
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value.tiers.map((t) => t.minimumQuantity), [12, 24]);
  const offStep = validatePricingDraft({ basePrice: '1,00', tiers: [{ minimumQuantity: '10', unitPrice: '0,90' }] }, rules);
  assert.ok(!offStep.ok && offStep.errors.tiers[0]?.key === 'productEditor.errors.tierStep');
  const notLower = validatePricingDraft({ basePrice: '1,00', tiers: [{ minimumQuantity: '12', unitPrice: '1,00' }] }, rules);
  assert.ok(!notLower.ok && notLower.errors.tiers[0]?.key === 'productEditor.errors.tierNotBelowBase');
  const noBase = validatePricingDraft({ basePrice: '', tiers: [{ minimumQuantity: '12', unitPrice: '0,50' }] }, rules);
  assert.ok(!noBase.ok && noBase.errors.basePrice?.key === 'productEditor.errors.baseForTiers');
  const empty = validatePricingDraft({ basePrice: '', tiers: [] }, rules);
  assert.ok(empty.ok && empty.value.basePrice === null);
  assert.ok(pricingUnchanged(undefined, { basePrice: null, tiers: [] }));
});

test('promotion schedule uses the country zone offset, DST-aware', () => {
  assert.deepEqual(toCountryLocalTime('2026-12-01T10:00', 'RS'), { localDateTime: '2026-12-01T10:00:00', offset: '+01:00' });
  assert.deepEqual(toCountryLocalTime('2026-07-01T10:00', 'BA'), { localDateTime: '2026-07-01T10:00:00', offset: '+02:00' });
  assert.equal(toCountryLocalTime('2026-02-30T10:00', 'RS'), null);
  assert.equal(toCountryLocalInput('2026-12-01T09:00:00.000Z', 'RS'), '2026-12-01T10:00');
  assert.equal(localTimeInstant({ localDateTime: '2026-12-01T10:00:00', offset: '+01:00' }), Date.parse('2026-12-01T09:00:00Z'));
});

test('promotion draft validation and actions', () => {
  const draft = { ...emptyPromotionDraft('RS', Date.parse('2026-10-01T00:00:00Z')), name: 'Autumn', value: '10' };
  const ok = validatePromotionDraft(draft, 'RS');
  assert.ok(ok.ok);
  const bad = validatePromotionDraft({ ...draft, value: '101', productMode: 'SELECTED', endsAt: draft.startsAt }, 'RS');
  assert.ok(!bad.ok);
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['endsAt', 'products', 'value']);
  const fixedZero = validatePromotionDraft({ ...draft, kind: 'FIXED_UNIT_PRICE', value: '0' }, 'RS');
  assert.ok(fixedZero.ok && fixedZero.value.value === '0.00');
  const p = { state: 'RUNNING', archived: false } as Promotion;
  assert.deepEqual(promotionActions(p), { edit: false, stop: true, archive: false });
  assert.deepEqual(promotionActions({ ...p, state: 'ENDED' }), { edit: false, stop: false, archive: true });
});
