import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, formatMoney, formatNumber, localToday, pickFormatLocale, setDisplayCountry } from './format';

const normal = (s: string) => s.replace(/\s/g, ' ');

test('money follows the currency country and keeps exact decimal strings', () => {
  assert.equal(normal(formatMoney('19.60', 'BAM')), '19,60 KM');
  assert.equal(normal(formatMoney('1234.50', 'BAM')), '1.234,50 KM');
  assert.match(normal(formatMoney('1234.50', 'RSD')), /^1\.234,50 RSD$/);
  // ICU gives RSD no minor digits; contract amounts are cents and must never be rounded for display.
  assert.match(normal(formatMoney('42.50', 'RSD')), /^42,50 RSD$/);
  assert.match(normal(formatMoney('42.5', 'RSD')), /^42,50 RSD$/);
});

test('numbers follow the display country', () => {
  setDisplayCountry('RS');
  assert.equal(formatNumber(5000), '5.000');
  setDisplayCountry('BA');
  assert.equal(formatNumber(5000), '5.000');
});

test('pickFormatLocale falls back when the runtime lacks locale data (Chrome + bs-BA)', () => {
  const chrome = (tag: string) => (tag.startsWith('bs') || tag === 'en' ? 'BAM 1,234.50' : '1.234,50 KM');
  assert.equal(pickFormatLocale('bs-Latn-BA', chrome), 'sr-Latn-BA');
  const full = (tag: string) => (tag === 'en' ? 'BAM 1,234.50' : '1.234,50 KM');
  assert.equal(pickFormatLocale('bs-Latn-BA', full), 'bs-Latn-BA');
  assert.equal(pickFormatLocale('en-GB', chrome), 'en-GB');
});

test('local calendar helpers use the country zone', () => {
  setDisplayCountry('RS');
  // 23:30 UTC on 31 Dec is already 1 Jan in Belgrade.
  assert.equal(localToday(new Date('2026-12-31T23:30:00.000Z')), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
