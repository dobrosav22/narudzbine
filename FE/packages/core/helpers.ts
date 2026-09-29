import { CURRENCY, LOCALE } from './config';
import { msg, type Msg } from './i18n/message';
import { MESSAGES, SUPPORTED_LOCALES } from './i18n';
import { roundMoney } from './pricing';
import type { Order, OrderStatus, VendorOrderStatusConfig } from './types';

export function orderTotal(order: Pick<Order, 'items'>): number {
  return roundMoney(order.items.reduce((sum, i) => sum + i.quantity * i.priceAtOrder, 0));
}

export function findStatus(config: VendorOrderStatusConfig | undefined, key: string): OrderStatus | undefined {
  return config?.statuses.find((s) => s.key === key);
}

/**
 * A status's display text. [assumed] The starter statuses seeded at signup (placed, confirmed,
 * fulfilled, cancelled) are system text (01 §12 lists status labels as translated), so while
 * one still carries its default name — in either language — it shows in the viewer's language.
 * Once the vendor renames it, or for any status the vendor added, the label is the vendor's
 * own text and shows exactly as written. 04 has only `label`, so this is decided on the client.
 */
export function statusLabel(status: Pick<OrderStatus, 'key' | 'label'> | undefined, fallback = ''): Msg {
  if (!status) return msg('common.verbatim', { text: fallback });
  const defaults = SUPPORTED_LOCALES.map((l) => (MESSAGES[l.value].defaultStatuses as Record<string, string>)[status.key]);
  return defaults.includes(status.label) ? msg(`defaultStatuses.${status.key}`) : msg('common.verbatim', { text: status.label });
}

/**
 * Badge tone derived from the status flags, never from the key/label, since
 * each vendor names statuses differently (05 §1: semantic colors, not purple).
 */
export type StatusTone = 'success' | 'destructive' | 'info';

/** Completed → success, cancelled → destructive, anything still in progress → info. */
export function statusTone(status: Pick<OrderStatus, 'isTerminal' | 'isCancelled'> | undefined): StatusTone {
  if (!status) return 'info';
  if (status.isCancelled) return 'destructive';
  return status.isTerminal ? 'success' : 'info';
}

/** The happy-path statuses in configured order (cancelled excluded) — what a progress tracker renders. */
export function progressSteps(config: VendorOrderStatusConfig): OrderStatus[] {
  return config.statuses.filter((s) => !s.isCancelled);
}

/*
 * Display formatting — the ONLY place numbers, money and dates are formatted
 * (never toLocaleString / toFixed in a screen). CURRENCY and LOCALE are
 * env-driven (config.ts); defaults BAM + bs-BA give "19,60 KM", "5.000", "10%".
 * Intl derives every symbol — never hardcode one (04 → "Currency").
 */
/**
 * Runtimes can *claim* a locale without shipping its data: Chrome resolves
 * "bs-BA" but formats it as English ("BAM 1,234.50"), while Node and others
 * give "1.234,50 KM". Same-convention fallbacks for such gaps — formatting
 * only, never UI language. See BUILD_LOG 2026-09-27 "Localized display".
 */
const FORMAT_FALLBACKS: Record<string, string[]> = {
  // sr-Latn-BA first: same money/percent format as Bosnian and a numeric date. hr-BA would
  // show Croatian month names ("27. ruj 2026.") — wrong for Bosnian readers.
  bs: ['sr-Latn-BA', 'hr-BA', 'hr'],
};

/** Exported for tests: pick the first of `locale` + fallbacks whose data the runtime really has. */
export function pickFormatLocale(locale: string, probe: (tag: string) => string): string {
  const language = locale.split('-')[0]!.toLowerCase();
  const fallbacks = FORMAT_FALLBACKS[language];
  if (!fallbacks || language === 'en') return locale;
  const english = probe('en');
  return [locale, ...fallbacks].find((tag) => probe(tag) !== english) ?? locale;
}

// Plain number format only: separators are what real locale data changes ("1.234,5" vs "1,234.5").
// A currency probe is fooled — Chrome's bs-BA fallback adds a space ("€ 1,234.50") yet has no Bosnian data.
const probeLocale = (tag: string) => new Intl.NumberFormat(tag).format(1234.5);

/** The locale actually used for display: LOCALE, or its fallback where the runtime lacks data. */
export const FORMAT_LOCALE: string = pickFormatLocale(LOCALE, probeLocale);

export function formatMoney(amount: number, currency: string = CURRENCY, locale: string = FORMAT_LOCALE): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function formatNumber(value: number, locale: string = FORMAT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** `value` is a percentage (10 → "10%"), matching Promotion.value. */
export function formatPercent(value: number, locale: string = FORMAT_LOCALE): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(value / 100);
}

export function formatDate(iso: string, locale: string = FORMAT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale: string = FORMAT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

/** The display symbol for CURRENCY in LOCALE ("KM" for BAM/bs-BA) — for input adornments, never hardcoded. */
export function currencySymbol(currency: string = CURRENCY, locale: string = FORMAT_LOCALE): string {
  return (
    new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ??
    currency
  );
}

/**
 * A 'YYYY-MM' bucket as a month name: 'short' → "sep" (chart axes), 'long' → "septembar 2026."
 * (tooltips, captions). Formatted in UTC so the bucket never shifts a month across time zones.
 */
export function formatMonth(period: string, style: 'short' | 'long' = 'short', locale: string = FORMAT_LOCALE): string {
  const [y, m] = period.split('-').map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, 1));
  const options: Intl.DateTimeFormatOptions =
    style === 'short' ? { month: 'short', timeZone: 'UTC' } : { month: 'long', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * A pluralised message: `count` picks the plural form (ICU, per UI language), `countText` is the
 * number formatted in the regional LOCALE — so "1.234" reads the same in English and Serbian.
 */
export function countMsg(key: string, count: number, extra?: Record<string, string | number>): Msg {
  return msg(key, { count, countText: formatNumber(count), ...extra });
}
