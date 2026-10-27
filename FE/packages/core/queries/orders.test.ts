import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrderState, Stage } from '../api/models.gen';
import {
  codePointLength,
  intentFor,
  isDuplicateStageName,
  isTerminalOrderState,
  isValidDateRange,
  isValidText,
  moveStageId,
  normalizeOrderFilter,
  orderActions,
  orderDateRange,
  orderEventKind,
  orderProgress,
  orderStateTone,
  ORDER_STATES,
  sortedStages,
  type OrderViewer,
} from './orders';

const vendor: OrderViewer = { side: 'VENDOR', role: 'STAFF', staffSubmissionRestricted: false };
const buyerOwner: OrderViewer = { side: 'BUYER', role: 'OWNER', staffSubmissionRestricted: true };
const buyerStaff: OrderViewer = { side: 'BUYER', role: 'STAFF', staffSubmissionRestricted: false };
const restrictedStaff: OrderViewer = { side: 'BUYER', role: 'STAFF', staffSubmissionRestricted: true };

const on = (actions: Record<string, boolean>) =>
  Object.entries(actions)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort();

test('vendor actions follow the core lifecycle', () => {
  assert.deepEqual(on(orderActions({ state: 'AWAITING_ACCEPTANCE', cancellationRequestId: null }, vendor)), ['accept', 'reject']);
  assert.deepEqual(on(orderActions({ state: 'ACCEPTED', cancellationRequestId: null }, vendor)), ['cancel', 'dispatch', 'setStage']);
  assert.deepEqual(on(orderActions({ state: 'DISPATCHED', cancellationRequestId: null }, vendor)), ['deliver']);
  for (const state of ['DELIVERED', 'REJECTED', 'CANCELLED'] as const) {
    assert.deepEqual(on(orderActions({ state, cancellationRequestId: null }, vendor)), [], state);
  }
});

test('a pending cancellation request blocks dispatch and offers approve/reject to the vendor', () => {
  assert.deepEqual(on(orderActions({ state: 'ACCEPTED', cancellationRequestId: 'r' }, vendor)), [
    'approveCancellation',
    'cancel',
    'rejectCancellation',
    'setStage',
  ]);
  assert.deepEqual(on(orderActions({ state: 'ACCEPTED', cancellationRequestId: 'r' }, buyerOwner)), ['reorder', 'withdrawCancellation']);
});

test('buyer actions honour the staff submission restriction', () => {
  assert.deepEqual(on(orderActions({ state: 'AWAITING_ACCEPTANCE', cancellationRequestId: null }, buyerOwner)), ['cancel', 'reorder']);
  assert.deepEqual(on(orderActions({ state: 'AWAITING_ACCEPTANCE', cancellationRequestId: null }, buyerStaff)), ['cancel', 'reorder']);
  assert.deepEqual(on(orderActions({ state: 'AWAITING_ACCEPTANCE', cancellationRequestId: null }, restrictedStaff)), ['reorder']);
  assert.deepEqual(on(orderActions({ state: 'ACCEPTED', cancellationRequestId: null }, buyerOwner)), ['reorder', 'requestCancellation']);
  assert.deepEqual(on(orderActions({ state: 'ACCEPTED', cancellationRequestId: null }, restrictedStaff)), ['reorder']);
  assert.deepEqual(on(orderActions({ state: 'CANCELLED', cancellationRequestId: null }, buyerOwner)), ['reorder', 'replace']);
  assert.deepEqual(on(orderActions({ state: 'CANCELLED', cancellationRequestId: null }, restrictedStaff)), ['reorder']);
  assert.deepEqual(on(orderActions({ state: 'REJECTED', cancellationRequestId: null }, buyerOwner)), ['reorder']);
});

test('progress marks the happy path and ends on rejection/cancellation', () => {
  assert.deepEqual(
    orderProgress('ACCEPTED').steps.map((s) => s.progress),
    ['done', 'current', 'upcoming', 'upcoming'],
  );
  assert.deepEqual(
    orderProgress('DELIVERED').steps.map((s) => s.progress),
    ['done', 'done', 'done', 'done'],
  );
  const cancelled = orderProgress('CANCELLED');
  assert.equal(cancelled.ended, 'CANCELLED');
  assert.ok(cancelled.steps.every((s) => s.progress === 'upcoming'));
});

test('every state has a tone and terminal flag', () => {
  const tones = new Set(ORDER_STATES.map((s: OrderState) => orderStateTone(s)));
  assert.ok(!tones.has(undefined as never));
  assert.deepEqual(ORDER_STATES.filter(isTerminalOrderState), ['DELIVERED', 'REJECTED', 'CANCELLED']);
});

test('date presets are inclusive country-local ranges', () => {
  assert.deepEqual(orderDateRange('all', '2026-10-25'), {});
  assert.deepEqual(orderDateRange('7', '2026-10-25'), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(orderDateRange('30', '2026-03-01'), { from: '2026-01-31', to: '2026-03-01' });
  assert.ok(isValidDateRange({ from: '2026-01-01', to: '2026-01-01' }));
  assert.ok(!isValidDateRange({ from: '2026-01-02', to: '2026-01-01' }));
  assert.ok(isValidDateRange({ from: '2026-01-02' }));
});

test('filters drop empty values', () => {
  assert.deepEqual(normalizeOrderFilter({ state: undefined, partnerId: '', from: '2026-01-01' }), { from: '2026-01-01' });
});

test('an intent key is reused only for the identical body', () => {
  let n = 0;
  const key = () => `k${++n}`;
  const first = intentFor(null, 'hello', key);
  assert.deepEqual(first, { key: 'k1', body: 'hello' });
  assert.equal(intentFor(first, 'hello', key), first);
  assert.deepEqual(intentFor(first, 'hello!', key), { key: 'k2', body: 'hello!' });
});

test('text limits count code points and ignore surrounding blanks', () => {
  assert.equal(codePointLength('😀a'), 2);
  assert.ok(!isValidText('   ', 10));
  assert.ok(isValidText('  ok  ', 2));
  assert.ok(!isValidText('abc', 2));
});

const stage = (id: string, name: string, position: number, state: Stage['state'] = 'ACTIVE'): Stage => ({ id, revision: 'r', name, state, position });

test('stage helpers sort, move and detect duplicate names', () => {
  const list = { stages: [stage('b', 'Packing', 1), stage('a', 'Picking', 0), stage('c', 'Old', 2, 'RETIRED')] };
  assert.deepEqual(sortedStages(list).map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(moveStageId(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveStageId(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.ok(isDuplicateStageName(list.stages, ' packing '));
  assert.ok(isDuplicateStageName(list.stages, 'OLD'));
  assert.ok(!isDuplicateStageName(list.stages, 'Packing', 'b'));
});

const ev = (e: Partial<Parameters<typeof orderEventKind>[0]>) =>
  orderEventKind({ state: 'ACCEPTED', previousState: 'ACCEPTED', stageId: null, previousStageId: null, cancellationRequestState: null, ...e });

test('event kinds match the backend event shapes', () => {
  assert.equal(ev({ state: 'AWAITING_ACCEPTANCE', previousState: null }), 'SUBMITTED');
  assert.equal(ev({ previousState: 'AWAITING_ACCEPTANCE' }), 'ACCEPTED');
  assert.equal(ev({ state: 'REJECTED', previousState: 'AWAITING_ACCEPTANCE' }), 'REJECTED');
  assert.equal(ev({ state: 'CANCELLED', previousState: 'AWAITING_ACCEPTANCE' }), 'CANCELLED');
  assert.equal(ev({ stageId: 's1' }), 'STAGE_SET');
  assert.equal(ev({ stageId: 's2', previousStageId: 's1' }), 'STAGE_SET');
  assert.equal(ev({ previousStageId: 's1' }), 'STAGE_CLEARED');
  assert.equal(ev({ stageId: 's1', previousStageId: 's1', cancellationRequestState: 'PENDING' }), 'CANCELLATION_REQUESTED');
  assert.equal(ev({ cancellationRequestState: 'REJECTED' }), 'CANCELLATION_DECLINED');
  assert.equal(ev({ cancellationRequestState: 'WITHDRAWN' }), 'CANCELLATION_WITHDRAWN');
  assert.equal(ev({ state: 'CANCELLED', cancellationRequestState: 'APPROVED' }), 'CANCELLATION_APPROVED');
  assert.equal(ev({ state: 'CANCELLED', cancellationRequestState: 'RESOLVED' }), 'CANCELLED');
  assert.equal(ev({ state: 'DISPATCHED', previousStageId: 's1' }), 'DISPATCHED');
  assert.equal(ev({ state: 'DELIVERED', previousState: 'DISPATCHED' }), 'DELIVERED');
});
