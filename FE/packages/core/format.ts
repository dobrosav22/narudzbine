import { msg, type Msg } from './i18n/message';
import type { Country, Currency } from './api/models';

/*
 * Display formatting — the ONLY place numbers, money and dates are formatted (never
 * toLocaleString / toFixed in a screen). Regional format follows the organization's country,
 * not the UI language: Serbia → sr-Latn-RS ("1.234,50 RSD"), Bosnia and Herzegovina →
 * bs-Latn-BA ("1.234,50 KM"). Dates render in the country's zone (Europe/Belgrade,
 * Europe/Sarajevo). Money arrives as exact decimal strings and is never re-rounded here.
 */

export const COUNTRY_TIME_ZONE: Record<Country, string> = { RS: 'Europe/Belgrade', BA: 'Europe/Sarajevo' };
export const COUNTRY_CURRENCY: Record<Country, Currency> = { RS: 'RSD', BA: 'BAM' };
const COUNTRY_FORMAT: Record<Country, string> = { RS: 'sr-Latn-RS', BA: 'bs-Latn-BA' };
const CURRENCY_COUNTRY: Record<Currency, Country> = { RSD: 'RS', BAM: 'BA' };

/**
 * Runtimes can *claim* a locale without shipping its data: Chrome resolves "bs-BA" but formats
 * it as English ("BAM 1,234.50"). Same-convention fallbacks for such gaps — formatting only.
 */
const FORMAT_FALLBACKS: Record<string, string[]> = {
  bs: ['sr-Latn-BA', 'hr-BA', 'hr'],
  sr: ['sr-Latn', 'hr'],
};

/** Exported for tests: the first of `locale` + fallbacks whose data the runtime really has. */
export function pickFormatLocale(locale: string, probe: (tag: string) => string): string {
  const language = locale.split('-')[0]!.toLowerCase();
  const fallbacks = FORMAT_FALLBACKS[language];
  if (!fallbacks || language === 'en') return locale;
  const english = probe('en');
  return [locale, ...fallbacks].find((tag) => probe(tag) !== english) ?? locale;
}

const probeLocale = (tag: string) => new Intl.NumberFormat(tag).format(1234.5);
const resolved = new Map<string, string>();
function formatLocale(tag: string): string {
  let value = resolved.get(tag);
  if (!value) resolved.set(tag, (value = pickFormatLocale(tag, probeLocale)));
  return value;
}

let region: Country = 'BA';
/** The viewer's organization country; set once from the session. Platform admins keep the default. */
export function setDisplayCountry(country: Country): void {
  region = country;
}
export function displayCountry(): Country {
  return region;
}

const regionLocale = () => formatLocale(COUNTRY_FORMAT[region]);
const currencyLocale = (currency: Currency) => formatLocale(COUNTRY_FORMAT[CURRENCY_COUNTRY[currency] ?? region]);

/**
 * "1.234,50 KM". Accepts the contract's decimal strings. Always two decimals: contract amounts
 * have cent precision, while ICU data gives RSD zero minor digits (Chrome would show 42.50 as "43").
 */
export function formatMoney(amount: string | number, currency: Currency): string {
  return new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(amount),
  );
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(regionLocale()).format(value);
}

/** `value` is a percentage (10 → "10 %"), as PERCENTAGE promotion values are. */
export function formatPercent(value: string | number): string {
  return new Intl.NumberFormat(regionLocale(), { style: 'percent', maximumFractionDigits: 2 }).format(Number(value) / 100);
}

/** The display symbol for a currency ("KM" for BAM) — for input adornments, never hardcoded. */
export function currencySymbol(currency: Currency): string {
  return (
    new Intl.NumberFormat(currencyLocale(currency), { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')
      ?.value ?? currency
  );
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(regionLocale(), { dateStyle: 'medium', timeZone: COUNTRY_TIME_ZONE[region] }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(regionLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: COUNTRY_TIME_ZONE[region] }).format(
    new Date(iso),
  );
}

/** A country-local calendar date (`YYYY-MM-DD`, as report/order filters take) for display. */
export function formatLocalDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(regionLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)));
}

/** Today's date in the region's zone as `YYYY-MM-DD` (default report/order filter bounds). */
export function localToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COUNTRY_TIME_ZONE[region], year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Shifts a `YYYY-MM-DD` date by whole days (calendar arithmetic, no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** A 'YYYY-MM' or 'YYYY-MM-DD' bucket start as a month name: 'short' → "sep" (axes), 'long' → "septembar 2026." */
export function formatMonth(period: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = period.split('-').map(Number);
  const options: Intl.DateTimeFormatOptions =
    style === 'short' ? { month: 'short', timeZone: 'UTC' } : { month: 'long', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(regionLocale(), options).format(new Date(Date.UTC(y!, (m ?? 1) - 1, 1)));
}

/** A pluralised message: `count` picks the plural form, `countText` is the regional number. */
export function countMsg(key: string, count: number, extra?: Record<string, string | number>): Msg {
  return msg(key, { count, countText: formatNumber(count), ...extra });
}
