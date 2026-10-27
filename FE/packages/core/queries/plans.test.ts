import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanRevision, VendorPlan } from '../api/models';
import { pendingPlanRequest, planAtLimit, planChangeWarnings, planNameMsg, orderPlansBySize } from './plans';

const rev = (code: PlanRevision['code'], productLimit: number, activeBuyerLimit: number, revision = 1): PlanRevision => ({
  id: `${code}-${revision}`,
  code,
  revision,
  retired: false,
  productLimit,
  activeBuyerLimit,
});
const current = (products: number, buyers: number, plan = rev('STARTER', 10, 5)): VendorPlan => ({
  id: 'v',
  revision: 'r',
  plan,
  nonArchivedProductCount: products,
  activeBuyerCount: buyers,
});

test('plans sort smallest first, whatever order the API returns', () => {
  const sorted = orderPlansBySize([rev('GROWTH', 250, 50), rev('PRO', 5000, 500), rev('STARTER', 10, 5)]);
  assert.deepEqual(sorted.map((p) => p.code), ['STARTER', 'GROWTH', 'PRO']);
});

test('the cap blocks at or over the limit', () => {
  assert.equal(planAtLimit(current(9, 4), 'products'), false);
  assert.equal(planAtLimit(current(10, 4), 'products'), true);
  assert.equal(planAtLimit(current(1, 6), 'buyers'), true);
  assert.equal(planAtLimit(undefined, 'buyers'), false);
});

test('a too-small target plan is called out per limit', () => {
  const warnings = planChangeWarnings(current(30, 2, rev('GROWTH', 250, 50)), rev('STARTER', 10, 5));
  assert.deepEqual(warnings.map((w) => w.key), ['plan.tooSmallProducts']);
  assert.deepEqual(planChangeWarnings(current(3, 2), rev('GROWTH', 250, 50)), []);
});

test('plan names add the revision only after the first one', () => {
  assert.equal(planNameMsg(rev('GROWTH', 1, 1)).key, 'plan.codes.GROWTH');
  assert.equal(planNameMsg(rev('GROWTH', 1, 1, 2)).key, 'plan.nameRevision');
});

test('the pending request is found among resolved ones', () => {
  const req = (state: 'PENDING' | 'REJECTED') => ({ id: state, state }) as Parameters<typeof pendingPlanRequest>[0] extends (infer R)[] | undefined ? R : never;
  assert.equal(pendingPlanRequest([req('REJECTED'), req('PENDING')])?.id, 'PENDING');
  assert.equal(pendingPlanRequest([req('REJECTED')]), undefined);
});
