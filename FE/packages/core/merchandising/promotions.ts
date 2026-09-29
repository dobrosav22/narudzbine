import { countMsg, formatDate, formatMoney, formatPercent } from '../helpers';
import { msg, type Msg } from '../i18n/message';
import { parseDecimal, toDecimalInput } from '../catalogue/productForm';
import { isPromotionLive } from '../pricing';
import type { CreatePromotionInput, Product, Promotion } from '../types';

// ── Status ───────────────────────────────────────────────────────────────

/**
 * What a promotion is doing right now. `isActive` is the vendor's on/off switch;
 * the dates decide the rest. An ended promotion reads "ended" even when paused —
 * resuming it wouldn't bring it back.
 */
export type PromotionState = 'live' | 'scheduled' | 'paused' | 'ended';

export function promotionState(p: Promotion, now: Date = new Date()): PromotionState {
  if (new Date(p.endDate).getTime() < now.getTime()) return 'ended';
  if (!p.isActive) return 'paused';
  return isPromotionLive(p, now) ? 'live' : 'scheduled';
}

/** Translation keys for each state's badge. */
export const PROMOTION_STATE_KEY: Record<PromotionState, string> = {
  live: 'promotions.state.live',
  scheduled: 'promotions.state.scheduled',
  paused: 'promotions.state.paused',
  ended: 'promotions.state.ended',
};

/** Live first, then upcoming, then paused, then history; newest start first within each. */
export function sortPromotions(list: Promotion[], now: Date = new Date()): Promotion[] {
  const rank: Record<PromotionState, number> = { live: 0, scheduled: 1, paused: 2, ended: 3 };
  return [...list].sort(
    (a, b) => rank[promotionState(a, now)] - rank[promotionState(b, now)] || b.startDate.localeCompare(a.startDate),
  );
}

// ── Display ──────────────────────────────────────────────────────────────

/** "10% off" · "0,50 KM off per unit" (a fixed promotion is per unit — 04 → price resolution). */
export function describeDiscount(p: Pick<Promotion, 'type' | 'value'>): Msg {
  return p.type === 'percentage'
    ? msg('promotions.discount.percentage', { value: formatPercent(p.value) })
    : msg('promotions.discount.fixed', { value: formatMoney(p.value) });
}

/** Translation keys for the scope picker. */
export const PROMOTION_SCOPE_KEY: Record<Promotion['scope'], string> = {
  all: 'promotions.scope.all',
  category: 'promotions.scope.category',
  product: 'promotions.scope.product',
  buyer: 'promotions.scope.buyer',
};

/**
 * "Whole catalogue" · "Napkins" · "Napkins, Towels" · "5 products". `names` maps ids of any
 * scope type to names. Names are vendor content, so they pass through untranslated
 * (`common.verbatim`); a missing one shows as "Removed product" etc.
 */
export function describeScope(p: Pick<Promotion, 'scope' | 'scopeIds'>, names: ReadonlyMap<string, string>): Msg {
  if (p.scope === 'all') return msg(PROMOTION_SCOPE_KEY.all);
  const known = p.scopeIds.map((id) => names.get(id));
  if (p.scopeIds.length === 1 && known[0] === undefined) return msg(`promotions.removed.${p.scope}`);
  if (p.scopeIds.length > 0 && p.scopeIds.length <= 2 && known.every((n) => n !== undefined))
    return msg('common.verbatim', { text: known.join(', ') });
  return countMsg(`promotions.scopeCount.${p.scope}`, p.scopeIds.length);
}

/** "27. 9. 2026. – 27. 10. 2026." */
export function describeDates(p: Pick<Promotion, 'startDate' | 'endDate'>): string {
  return `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`;
}

/**
 * How many products the promotion can discount. Buyer-scoped promotions cover the
 * whole active catalogue for those buyers, so the count is the catalogue size.
 */
export function promotionReach(p: Pick<Promotion, 'scope' | 'scopeIds'>, products: Product[]): number {
  const active = products.filter((x) => x.isActive);
  switch (p.scope) {
    case 'all':
    case 'buyer':
      return active.length;
    case 'product':
      return active.filter((x) => p.scopeIds.includes(x.id)).length;
    case 'category':
      return active.filter((x) => x.categoryId !== undefined && p.scopeIds.includes(x.categoryId)).length;
  }
}

// ── Dates ────────────────────────────────────────────────────────────────
// Date inputs speak local calendar days ('YYYY-MM-DD'); the contract stores ISO
// instants. A promotion runs from the start of its first day to the end of its last,
// in the vendor's local time — so "ends 31 Oct" still applies to an order at 23:30.

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of an instant, as a date-input value. */
export function toDateInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(day: string): [number, number, number] | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(y, mo - 1, d);
  // Rejects 2026-02-30 and friends, which Date would silently roll over.
  return check.getFullYear() === y && check.getMonth() === mo - 1 && check.getDate() === d ? [y, mo, d] : undefined;
}

export function startOfDayIso(day: string): string | undefined {
  const p = parseDay(day);
  return p && new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0).toISOString();
}

export function endOfDayIso(day: string): string | undefined {
  const p = parseDay(day);
  return p && new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999).toISOString();
}

export function addDays(day: string, days: number): string {
  const p = parseDay(day);
  if (!p) return day;
  return toDateInput(new Date(p[0], p[1] - 1, p[2] + days));
}

// ── Form draft ───────────────────────────────────────────────────────────

/** Promotion form state, shared by web and mobile. Value is text as typed (locale decimal comma). */
export interface PromotionDraft {
  type: Promotion['type'];
  value: string;
  scope: Promotion['scope'];
  /** Ids of the chosen scope's type; `withScope` clears them when the scope changes. */
  scopeIds: string[];
  startDay: string;
  endDay: string;
  isActive: boolean;
}

export type PromotionDraftField = 'value' | 'scopeIds' | 'startDay' | 'endDay';

/** A new promotion: 10% off, starting today, for 30 days, switched on. */
export function emptyPromotionDraft(today: Date = new Date()): PromotionDraft {
  const start = toDateInput(today);
  return { type: 'percentage', value: '10', scope: 'all', scopeIds: [], startDay: start, endDay: addDays(start, 30), isActive: true };
}

/** Change scope; ids of another type would be meaningless (a category id isn't a product), so they're dropped. */
export function withScope(draft: PromotionDraft, scope: PromotionDraft['scope']): PromotionDraft {
  return scope === draft.scope ? draft : { ...draft, scope, scopeIds: [] };
}

export function draftFromPromotion(p: Promotion): PromotionDraft {
  return {
    type: p.type,
    value: p.type === 'percentage' ? toDecimalInput(p.value, Number.isInteger(p.value) ? 0 : 2) : toDecimalInput(p.value),
    scope: p.scope,
    scopeIds: [...p.scopeIds],
    startDay: toDateInput(p.startDate),
    endDay: toDateInput(p.endDate),
    isActive: p.isActive,
  };
}

export type PromotionFields = Omit<CreatePromotionInput, 'vendorOrgId'>;

/**
 * Same rules as the service (mocks/merchandising.ts), checked before saving so
 * both apps show the same messages next to the fields. `input` is set only when valid.
 */
export function validatePromotionDraft(draft: PromotionDraft): {
  input?: PromotionFields;
  errors: Partial<Record<PromotionDraftField, Msg>>;
} {
  const errors: Partial<Record<PromotionDraftField, Msg>> = {};

  const value = parseDecimal(draft.value);
  if (value === undefined) errors.value = msg(draft.value.trim() ? 'validation.promotion.valueInvalid' : 'validation.promotion.valueRequired');
  else if (value <= 0) errors.value = msg('errors.discountNotPositive');
  else if (draft.type === 'percentage' && value > 100) errors.value = msg('errors.discountOver100');
  else if (draft.type === 'fixed' && Math.round(value * 100) !== Number((value * 100).toPrecision(12)))
    errors.value = msg('validation.promotion.twoDecimals');

  const scopeIds = draft.scope === 'all' ? [] : [...new Set(draft.scopeIds)];
  if (draft.scope !== 'all' && scopeIds.length === 0) errors.scopeIds = msg('errors.scopeEmpty', { scope: draft.scope });

  const startDate = startOfDayIso(draft.startDay);
  const endDate = endOfDayIso(draft.endDay);
  if (!startDate) errors.startDay = msg('validation.promotion.startRequired');
  if (!endDate) errors.endDay = msg('validation.promotion.endRequired');
  else if (startDate && endDate < startDate) errors.endDay = msg('errors.endBeforeStart');

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    input: { type: draft.type, value: value!, scope: draft.scope, scopeIds, startDate: startDate!, endDate: endDate!, isActive: draft.isActive },
  };
}

// ── Featured list ────────────────────────────────────────────────────────

/** Swap an item with its neighbour; out-of-range moves return the list unchanged. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to]!, next[index]!];
  return next;
}

/** [assumed] No limit in the contract; the buyer home shelf reads best with a handful. Soft cap, shown as a hint. */
export const FEATURED_SUGGESTED_MAX = 8;
