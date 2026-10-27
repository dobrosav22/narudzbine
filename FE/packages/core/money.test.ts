import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPercent, centsToMoney, compareMoney, divideMoney, moneyToCents, sumMoney } from './money';

test('parses and prints contract money exactly', () => {
  assert.equal(moneyToCents('12.5'), 1250n);
  assert.equal(moneyToCents('-0.05'), -5n);
  assert.equal(centsToMoney(123456789012345n), '1234567890123.45');
  assert.throws(() => moneyToCents('1e3'));
  assert.throws(() => moneyToCents('01.00'));
});

test('sums and compares without float error', () => {
  assert.equal(sumMoney(['0.10', '0.20']), '0.30');
  assert.equal(compareMoney('0.75', '0.8'), -1);
  assert.equal(compareMoney('10', '10.00'), 0);
});

test('divides half-up to cents', () => {
  assert.equal(divideMoney('100.00', 3), '33.33');
  assert.equal(divideMoney('0.05', 2), '0.03');
  assert.equal(divideMoney('10.00', 0), null);
  assert.equal(divideMoney('10.00', 1.5), null);
});

test('applies percent changes half-up like the backend bulk edit', () => {
  assert.equal(applyPercent('12.00', '-12.25'), '10.53');
  assert.equal(applyPercent('0.10', '5'), '0.11');
  assert.equal(applyPercent('100.00', '-100'), '0.00');
});
