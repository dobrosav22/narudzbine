import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnglish as en } from '../i18n/message';
import { createServices } from '../serviceProvider';
import { db, resetMockDb } from '../mocks/db';
import { setMockLatency } from '../mocks/util';
import type { Promotion } from '../types';
import {
  addDays,
  describeDiscount,
  describeScope,
  draftFromPromotion,
  emptyPromotionDraft,
  endOfDayIso,
  moveItem,
  promotionReach,
  promotionState,
  sortPromotions,
  startOfDayIso,
  toDateInput,
  validatePromotionDraft,
  withScope,
} from './promotions';
import { averageOrderValue, hasActivity } from '../stats/view';
import { formatMonth } from '../helpers';

setMockLatency(0);
const s = createServices(true);
beforeEach(() => resetMockDb());
const papirkoPromos = () => db.promotions.filter((p) => p.vendorOrgId === 'vo_papirko');

test('seed covers every promotion state; list sorts live → scheduled → paused → ended', () => {
  const states = sortPromotions(papirkoPromos()).map((p) => promotionState(p));
  assert.deepEqual([...new Set(states)], ['live', 'scheduled', 'paused', 'ended']);
  // A paused promotion whose end date has passed is history, not "paused".
  const ended = { ...db.promotions.find((p) => p.id === 'promo_summer_tp')!, isActive: false };
  assert.equal(promotionState(ended), 'ended');
});

test('descriptions: discount per unit, scope names, counts past two', () => {
  assert.match(en(describeDiscount({ type: 'percentage', value: 10 })), /^10\s?% off$/);
  assert.match(en(describeDiscount({ type: 'fixed', value: 2.5 })), /off per unit$/);
  const names = new Map([['cat_napkins', 'Napkins'], ['cat_tp', 'Toilet paper']]);
  assert.equal(en(describeScope({ scope: 'all', scopeIds: [] }, names)), 'Whole catalogue');
  assert.equal(en(describeScope({ scope: 'category', scopeIds: ['cat_napkins', 'cat_tp'] }, names)), 'Napkins, Toilet paper');
  assert.equal(en(describeScope({ scope: 'product', scopeIds: ['a', 'b', 'c'] }, names)), '3 products');
  assert.equal(en(describeScope({ scope: 'buyer', scopeIds: ['gone'] }, names)), 'Removed buyer');
});

test('reach counts active products only; buyer scope covers the whole catalogue', () => {
  const products = db.products.filter((p) => p.vendorOrgId === 'vo_papirko');
  const active = products.filter((p) => p.isActive).length;
  assert.equal(promotionReach({ scope: 'category', scopeIds: ['cat_gloves'] }, products), 1); // vinyl is discontinued
  assert.equal(promotionReach({ scope: 'buyer', scopeIds: ['bo_lipa'] }, products), active);
  assert.equal(promotionReach({ scope: 'product', scopeIds: ['p_tw_centre', 'nope'] }, products), 1);
});

test('dates: local calendar days round-trip; invalid days rejected; end covers the whole day', () => {
  assert.equal(toDateInput(startOfDayIso('2026-10-31')!), '2026-10-31');
  assert.equal(toDateInput(endOfDayIso('2026-10-31')!), '2026-10-31');
  assert.equal(new Date(endOfDayIso('2026-10-31')!).getHours(), 23);
  assert.equal(startOfDayIso('2026-02-30'), undefined);
  assert.equal(startOfDayIso(''), undefined);
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

test('draft validation mirrors the service; switching to "all" drops stale ids', () => {
  const ok = validatePromotionDraft({ ...emptyPromotionDraft(new Date(2026, 8, 28)), scopeIds: ['leftover'] });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.input?.scopeIds, []);
  assert.equal(ok.input?.value, 10);

  const bad = validatePromotionDraft({
    type: 'percentage', value: '120', scope: 'product', scopeIds: [], startDay: '2026-10-10', endDay: '2026-10-01', isActive: true,
  });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['endDay', 'scopeIds', 'value']);
  assert.equal(bad.input, undefined);

  // Locale decimal comma, cents precision for a fixed amount.
  const fixed = (value: string) => validatePromotionDraft({ ...emptyPromotionDraft(), type: 'fixed', value });
  assert.equal(fixed('2,50').input?.value, 2.5);
  assert.equal(en(fixed('2,555').errors.value!), 'Use at most two decimals');
  assert.equal(en(fixed('0').errors.value!), 'The discount must be greater than zero');
  // Changing scope drops ids of the old type.
  const cat = { ...emptyPromotionDraft(), scope: 'category' as const, scopeIds: ['cat_tp'] };
  assert.deepEqual(withScope(cat, 'product').scopeIds, []);
  assert.deepEqual(withScope(cat, 'category').scopeIds, ['cat_tp']);
  // A same-day promotion is valid (start of day → end of day).
  assert.ok(validatePromotionDraft({ ...emptyPromotionDraft(), endDay: emptyPromotionDraft().startDay }).input);
});

test('edit round-trip: draft from a seeded promotion validates back to the same fields', () => {
  const promo = db.promotions.find((p) => p.id === 'promo_disinf')!;
  const { input } = validatePromotionDraft(draftFromPromotion(promo));
  assert.equal(input?.value, 2.9);
  assert.equal(input?.type, 'fixed');
  assert.deepEqual(input?.scopeIds, ['p_cp_disinf']);
  assert.equal(toDateInput(input!.endDate), toDateInput(promo.endDate));
});

test('saved promotion changes the buyer price; pausing it restores the list price', async () => {
  const draft = { ...emptyPromotionDraft(), value: '20', scope: 'buyer' as const, scopeIds: ['bo_aurora'] };
  const promo: Promotion = await s.merchandising.createPromotion({ vendorOrgId: 'vo_papirko', ...validatePromotionDraft(draft).input! });
  const price = async () =>
    (await s.pricing.resolvePrices({ vendorOrgId: 'vo_papirko', buyerOrgId: 'bo_aurora', items: [{ productId: 'p_glv_nitrile', quantity: 1 }] }))[0]!;
  assert.equal((await price()).appliedPromotion?.id, promo.id);
  await s.merchandising.updatePromotion(promo.id, { isActive: false });
  assert.equal((await price()).appliedPromotion, undefined);
});

test('featured: moveItem swaps neighbours; setFeatured keeps the new order', async () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], 0, -1), ['a', 'b']);
  const ids = (await s.merchandising.listFeatured('vo_papirko')).map((f) => f.productId);
  await s.merchandising.setFeatured('vo_papirko', moveItem(ids, 0, 1));
  const after = (await s.merchandising.listFeatured('vo_papirko')).map((f) => f.productId);
  assert.deepEqual(after, [ids[1], ids[0], ...ids.slice(2)]);
});

test('stats view helpers', () => {
  assert.equal(averageOrderValue(100, 0), 0);
  assert.equal(averageOrderValue(100, 3), 33.33);
  assert.equal(hasActivity([{ period: '2026-09', revenue: 0, orderCount: 0 }]), false);
  assert.equal(formatMonth('2026-01', 'long', 'en-US'), 'January 2026');
  assert.equal(formatMonth('2026-12', 'short', 'en-US'), 'Dec');
});
