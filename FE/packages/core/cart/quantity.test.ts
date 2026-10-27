import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidQuantity, MAX_QUANTITY, maxQuantity, quantityIssue, snapQuantity, stepQuantity } from './quantity';
import { compareMoney, sumMoney } from '../money';

const packOf6 = { minimumQuantity: 6, quantityStep: 6 };
const min5step3 = { minimumQuantity: 5, quantityStep: 3 };

test('validity follows the backend rule: >= minimum and (q - minimum) % step === 0', () => {
  assert.equal(isValidQuantity(6, packOf6), true);
  assert.equal(isValidQuantity(12, packOf6), true);
  assert.equal(quantityIssue(7, packOf6), 'STEP');
  assert.equal(quantityIssue(5, packOf6), 'BELOW_MINIMUM');
  assert.equal(quantityIssue(1.5, packOf6), 'BELOW_MINIMUM');
  // Steps count from the minimum, not from zero.
  assert.equal(isValidQuantity(8, min5step3), true);
  assert.equal(isValidQuantity(9, min5step3), false);
  assert.equal(quantityIssue(MAX_QUANTITY + 6, { minimumQuantity: 1, quantityStep: 1 }), 'TOO_LARGE');
});

test('snap rounds up to the next valid quantity and never below the minimum', () => {
  assert.equal(snapQuantity(0, packOf6), 6);
  assert.equal(snapQuantity(7, packOf6), 12);
  assert.equal(snapQuantity(12, packOf6), 12);
  assert.equal(snapQuantity(9, min5step3), 11);
  assert.equal(snapQuantity(Number.NaN, min5step3), 5);
  assert.equal(snapQuantity(MAX_QUANTITY * 2, packOf6), maxQuantity(packOf6));
});

test('step moves between valid quantities', () => {
  assert.equal(stepQuantity(6, packOf6, 1), 12);
  assert.equal(stepQuantity(12, packOf6, -1), 6);
  assert.equal(stepQuantity(6, packOf6, -1), 6);
  assert.equal(stepQuantity(7, packOf6, 1), 12, 'off-step up snaps to the next valid');
  assert.equal(stepQuantity(13, packOf6, -1), 12, 'off-step down lands on the valid one below');
  assert.equal(stepQuantity(3, packOf6, -1), 6);
});

test('money sums exactly as cents and compares', () => {
  assert.equal(sumMoney(['0.10', '0.20']), '0.30');
  assert.equal(sumMoney(['18.00', '37.80', '0.05']), '55.85');
  assert.equal(sumMoney([]), '0.00');
  assert.equal(compareMoney('0.75', '0.85'), -1);
  assert.equal(compareMoney('10.00', '10.00'), 0);
  assert.equal(sumMoney(['1.5']), '1.50');
  assert.throws(() => sumMoney(['1.505']));
});
