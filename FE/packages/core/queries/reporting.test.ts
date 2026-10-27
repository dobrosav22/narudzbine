import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  averageAmount,
  customReportRange,
  presetReportRange,
  reportDaysInRange,
  reportExportFileName,
  reportExportPollDelay,
  reportMonthsInRange,
  reportRangeProblem,
} from './reporting';

test('presets end today and stay inside the backend bucket limits', () => {
  const today = '2026-10-25';
  assert.deepEqual(presetReportRange('7d', today), { from: '2026-10-19', to: today, grouping: 'DAY' });
  assert.deepEqual(presetReportRange('30d', today), { from: '2026-09-26', to: today, grouping: 'DAY' });
  assert.equal(reportDaysInRange(presetReportRange('90d', today).from, today), 90);
  assert.deepEqual(presetReportRange('12m', today), { from: '2025-11-01', to: today, grouping: 'MONTH' });
  assert.deepEqual(presetReportRange('ytd', today), { from: '2026-01-01', to: today, grouping: 'MONTH' });
  const fiveYears = presetReportRange('5y', today);
  assert.equal(fiveYears.from, '2021-11-01');
  assert.equal(reportMonthsInRange(fiveYears.from, today), 60);
});

test('month arithmetic crosses year boundaries', () => {
  assert.deepEqual(presetReportRange('12m', '2026-01-15'), { from: '2025-02-01', to: '2026-01-15', grouping: 'MONTH' });
  assert.equal(reportMonthsInRange('2025-12-31', '2026-01-01'), 2);
});

test('custom ranges are validated like the backend does', () => {
  const today = '2026-10-25';
  assert.equal(reportRangeProblem({ from: '2026-10-01', to: '2026-10-25' }, today), null);
  assert.equal(reportRangeProblem({ from: '2026-02-30', to: '2026-03-01' }, today), 'INVALID_DATE');
  assert.equal(reportRangeProblem({ from: '', to: '2026-03-01' }, today), 'INVALID_DATE');
  assert.equal(reportRangeProblem({ from: '2026-10-10', to: '2026-10-01' }, today), 'REVERSED');
  assert.equal(reportRangeProblem({ from: '2026-10-01', to: '2026-10-26' }, today), 'FUTURE');
  assert.equal(reportRangeProblem({ from: '2021-10-01', to: '2026-10-25' }, today), 'TOO_LONG');
  assert.equal(reportRangeProblem({ from: '2021-11-01', to: '2026-10-25' }, today), null);
});

test('custom ranges chart per day up to 92 days, then per month', () => {
  assert.equal(customReportRange({ from: '2026-07-26', to: '2026-10-25' }).grouping, 'DAY');
  assert.equal(customReportRange({ from: '2026-07-25', to: '2026-10-25' }).grouping, 'MONTH');
});

test('average amounts divide exact decimals and round half-up', () => {
  assert.equal(averageAmount('100.00', 3), '33.33');
  assert.equal(averageAmount('0.05', 2), '0.03');
  assert.equal(averageAmount('20', 1), '20.00');
  assert.equal(averageAmount('123456789012345.67', 1), '123456789012345.67');
  assert.equal(averageAmount('10.00', 0), null);
});

test('export helpers', () => {
  assert.equal(reportExportFileName('REPORT_PRODUCTS', { from: '2026-10-01', to: '2026-10-25' }), 'report-products_2026-10-01_2026-10-25.csv');
  assert.deepEqual([0, 1, 2, 3, 10].map(reportExportPollDelay), [2000, 4000, 8000, 15000, 15000]);
});

test('report reads run one at a time, in call order, even when one fails', async () => {
  const { oneReportAtATime } = await import('./reporting');
  const log: string[] = [];
  const slow = (name: string, ms: number, fail = false) => () =>
    new Promise<string>((resolve, reject) => {
      log.push(`start ${name}`);
      setTimeout(() => {
        log.push(`end ${name}`);
        if (fail) reject(new Error(name));
        else resolve(name);
      }, ms);
    });
  const results = await Promise.allSettled([oneReportAtATime(slow('summary', 30)), oneReportAtATime(slow('products', 5, true)), oneReportAtATime(slow('buyers', 1))]);
  assert.deepEqual(log, ['start summary', 'end summary', 'start products', 'end products', 'start buyers', 'end buyers']);
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
});
