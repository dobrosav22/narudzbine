import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv4, uuidv7 } from './ids';

const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('uuidv7 matches the contract Id pattern and is monotonic within a millisecond', () => {
  const ids = Array.from({ length: 500 }, () => uuidv7(1_760_000_000_000));
  for (const id of ids) assert.match(id, V7);
  assert.deepEqual([...ids].sort(), ids);
  assert.equal(new Set(ids).size, ids.length);
});

test('uuidv4 matches the Idempotency-Key pattern', () => {
  for (let i = 0; i < 50; i++) assert.match(uuidv4(), V4);
});
