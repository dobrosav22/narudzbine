import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { CURRENCY, LOCALE } from './config';
import { formatMoney, formatNumber, statusLabel } from './helpers';

test('defaults: BAM in bs-BA → "19,60 KM", thousands with dots', () => {
  assert.equal(CURRENCY, 'BAM');
  assert.equal(LOCALE, 'bs-BA');
  // Intl separates amount and symbol with a non-breaking space; normalise for comparison.
  assert.equal(formatMoney(19.6).replace(/\s/g, ' '), '19,60 KM');
  assert.equal(formatMoney(1234.5).replace(/\s/g, ' '), '1.234,50 KM');
  assert.equal(formatNumber(5000), '5.000');
});

test('CURRENCY / NEXT_PUBLIC_CURRENCY / EXPO_PUBLIC_CURRENCY override it; garbage fails loudly', () => {
  const run = (env: Record<string, string>) =>
    execFileSync(process.execPath, ['--import', 'tsx', '-e', "console.log(require('./config/env.ts').CURRENCY)"], {
      cwd: import.meta.dirname, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  assert.equal(run({ CURRENCY: 'eur' }), 'EUR');
  assert.equal(run({ NEXT_PUBLIC_CURRENCY: 'RSD' }), 'RSD');
  assert.equal(run({ EXPO_PUBLIC_CURRENCY: 'USD' }), 'USD');
  assert.throws(() => run({ CURRENCY: 'KM' }));
});

test('LOCALE / NEXT_PUBLIC_LOCALE / EXPO_PUBLIC_LOCALE override it; invalid tags fail loudly', () => {
  const run = (env: Record<string, string>) =>
    execFileSync(process.execPath, ['--import', 'tsx', '-e', "console.log(require('./config/env.ts').LOCALE)"], {
      cwd: import.meta.dirname, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  assert.equal(run({ LOCALE: 'en-gb' }), 'en-GB');
  assert.equal(run({ NEXT_PUBLIC_LOCALE: 'sr-Latn-BA' }), 'sr-Latn-BA');
  assert.equal(run({ EXPO_PUBLIC_LOCALE: 'hr-BA' }), 'hr-BA');
  assert.throws(() => run({ LOCALE: 'not a locale!' }));
});

test('pickFormatLocale: falls back when the runtime lacks locale data (Chrome + bs-BA)', async () => {
  const { pickFormatLocale } = await import('./helpers');
  // Simulated Chrome: bs/bs-BA silently format like English; sr-Latn-BA and hr-BA have real data.
  const chrome = (tag: string) => (tag.startsWith('bs') || tag === 'en' ? 'BAM 1,234.50' : '1.234,50 KM');
  assert.equal(pickFormatLocale('bs-BA', chrome), 'sr-Latn-BA');
  // Full ICU (Node): bs-BA is used as-is.
  const full = (tag: string) => (tag === 'en' ? 'BAM 1,234.50' : '1.234,50 KM');
  assert.equal(pickFormatLocale('bs-BA', full), 'bs-BA');
  // Languages without a fallback list, and English, are never substituted.
  assert.equal(pickFormatLocale('de-DE', chrome), 'de-DE');
  assert.equal(pickFormatLocale('en-GB', chrome), 'en-GB');
});

test('statusLabel: untouched starter statuses are system text; renamed or custom ones are the vendor\'s', () => {
  // Default name in either language → translated by key.
  assert.deepEqual(statusLabel({ key: 'placed', label: 'Placed' }), { key: 'defaultStatuses.placed' });
  assert.deepEqual(statusLabel({ key: 'cancelled', label: 'Otkazana' }), { key: 'defaultStatuses.cancelled' });
  // Renamed default, or a status the vendor added → shown as written.
  assert.deepEqual(statusLabel({ key: 'placed', label: 'New order' }), { key: 'common.verbatim', values: { text: 'New order' } });
  assert.deepEqual(statusLabel({ key: 'packed', label: 'Packed' }), { key: 'common.verbatim', values: { text: 'Packed' } });
  assert.deepEqual(statusLabel(undefined, 'ghost'), { key: 'common.verbatim', values: { text: 'ghost' } });
});
