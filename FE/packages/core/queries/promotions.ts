import { api, data } from '../api/client';
import type { Country, LocalTime, Promotion, PromotionInput, PromotionUpdate, QueryOf } from '../api/models';
import { COUNTRY_TIME_ZONE } from '../format';
import { msg, type Msg } from '../i18n/message';
import { compareMoney } from '../money';
import { parsePriceInput, priceToInput } from './catalogue';

/*
 * Vendor promotions: percentage or fixed replacement unit price, product/category and buyer
 * targeting, country-local schedule. State (SCHEDULED/RUNNING/ENDED/STOPPED) is derived by the
 * backend; `archived` is separate. Definitions freeze at start; stop has no resume.
 */

export type PromotionListQuery = QueryOf<'listPromotions'>;
export type PromotionState = Promotion['state'];
export type PromotionKind = Promotion['kind'];

export const promotionKeys = {
  all: ['promotions'] as const,
  list: (q: PromotionListQuery) => ['promotions', 'list', q] as const,
  one: (id: string) => ['promotions', 'one', id] as const,
};

export const promotionQueries = {
  list: (q: PromotionListQuery) => ({
    queryKey: promotionKeys.list(q),
    queryFn: () => data(api.GET('/promotions', { params: { query: q } })),
  }),
  one: (id: string) => ({
    queryKey: promotionKeys.one(id),
    queryFn: () => data(api.GET('/promotions/{promotionId}', { params: { path: { promotionId: id } } })),
  }),
};

export function createPromotion(body: PromotionInput): Promise<Promotion> {
  return data(api.POST('/promotions', { body }));
}

export function updatePromotion(id: string, body: PromotionUpdate): Promise<Promotion> {
  return data(api.PUT('/promotions/{promotionId}', { params: { path: { promotionId: id } }, body }));
}

export function stopPromotion(id: string, expectedRevision: string): Promise<Promotion> {
  return data(api.POST('/promotions/{promotionId}/stop', { params: { path: { promotionId: id } }, body: { expectedRevision } }));
}

export function archivePromotion(id: string, expectedRevision: string): Promise<Promotion> {
  return data(api.POST('/promotions/{promotionId}/archive', { params: { path: { promotionId: id } }, body: { expectedRevision } }));
}

/** Edits are allowed only before the start; stop before/while running; archive after end/stop. */
export function promotionActions(p: Promotion): { edit: boolean; stop: boolean; archive: boolean } {
  if (p.archived) return { edit: false, stop: false, archive: false };
  return {
    edit: p.state === 'SCHEDULED',
    stop: p.state === 'SCHEDULED' || p.state === 'RUNNING',
    archive: p.state === 'ENDED' || p.state === 'STOPPED',
  };
}

// ── Country-local schedule ──────────────────────────────────────────────

const WALL = new Map<string, Intl.DateTimeFormat>();
function wallFormat(timeZone: string): Intl.DateTimeFormat {
  let f = WALL.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    WALL.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone, as a UTC epoch (for offset arithmetic). */
function wallAsUtc(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(wallFormat(timeZone).formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
}

function offsetMinutesAt(instant: number, timeZone: string): number {
  return Math.round((wallAsUtc(instant, timeZone) - instant) / 60_000);
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * A `YYYY-MM-DDTHH:mm` value typed in the organization's zone (datetime-local input) as the
 * contract's LocalTime with the zone's real offset at that moment (DST-aware). Null when the
 * text is not a valid local date-time.
 */
export function toCountryLocalTime(local: string, country: Country): LocalTime | null {
  const m = LOCAL_INPUT.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (Number.isNaN(asUtc) || new Date(asUtc).getUTCDate() !== Number(d)) return null;
  const zone = COUNTRY_TIME_ZONE[country];
  const first = offsetMinutesAt(asUtc, zone);
  const offset = offsetMinutesAt(asUtc - first * 60_000, zone);
  return { localDateTime: `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}`, offset: formatOffset(offset) };
}

/** UTC instant of a LocalTime (for client-side ordering checks). */
export function localTimeInstant(t: LocalTime): number {
  const m = LOCAL_INPUT.exec(t.localDateTime)!;
  const [, y, mo, d, h, mi, s] = m;
  const sign = t.offset.startsWith('-') ? -1 : 1;
  const [oh, om] = t.offset.slice(1).split(':').map(Number);
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)) - sign * ((oh ?? 0) * 60 + (om ?? 0)) * 60_000;
}

/** A UTC timestamp as the `YYYY-MM-DDTHH:mm` wall time of the organization's zone (form prefill). */
export function toCountryLocalInput(iso: string | number, country: Country): string {
  const wall = new Date(wallAsUtc(typeof iso === 'number' ? iso : Date.parse(iso), COUNTRY_TIME_ZONE[country]));
  return wall.toISOString().slice(0, 16);
}

// ── Promotion form ──────────────────────────────────────────────────────

export interface PromotionDraft {
  name: string;
  kind: PromotionKind;
  value: string;
  productMode: 'ALL' | 'SELECTED';
  productIds: string[];
  categoryIds: string[];
  buyerMode: 'ALL' | 'SELECTED';
  buyerIds: string[];
  /** `YYYY-MM-DDTHH:mm` in the organization's zone. */
  startsAt: string;
  endsAt: string;
}

export type PromotionDraftField = 'name' | 'value' | 'products' | 'buyers' | 'startsAt' | 'endsAt';
export type PromotionDraftErrors = Partial<Record<PromotionDraftField, Msg>>;

export const PROMOTION_TARGETS_MAX = 1000;
export const PROMOTION_NAME_MAX = 200;

export function emptyPromotionDraft(country: Country, now: number = Date.now()): PromotionDraft {
  const start = Math.ceil((now + 60 * 60_000) / 3_600_000) * 3_600_000;
  return {
    name: '',
    kind: 'PERCENTAGE',
    value: '',
    productMode: 'ALL',
    productIds: [],
    categoryIds: [],
    buyerMode: 'ALL',
    buyerIds: [],
    startsAt: toCountryLocalInput(start, country),
    endsAt: toCountryLocalInput(start + 7 * 86_400_000, country),
  };
}

export function promotionToDraft(p: Promotion, country: Country): PromotionDraft {
  return {
    name: p.name,
    kind: p.kind,
    value: priceToInput(p.value),
    productMode: p.targets.productMode,
    productIds: [...p.targets.productIds],
    categoryIds: [...p.targets.categoryIds],
    buyerMode: p.targets.buyerMode,
    buyerIds: [...p.targets.buyerIds],
    startsAt: toCountryLocalInput(p.startsAt, country),
    endsAt: toCountryLocalInput(p.endsAt, country),
  };
}

/** Validates a draft into the shared create/update body (without id/expectedRevision). */
export function validatePromotionDraft(
  d: PromotionDraft,
  country: Country,
): { ok: true; value: Omit<PromotionInput, 'id'> } | { ok: false; errors: PromotionDraftErrors } {
  const errors: PromotionDraftErrors = {};
  const name = d.name.trim();
  if (!name) errors.name = msg('merch.dialog.errors.nameRequired');
  else if (Array.from(name).length > PROMOTION_NAME_MAX) errors.name = msg('merch.dialog.errors.tooLong', { max: PROMOTION_NAME_MAX });
  const value = parsePriceInput(d.value, { allowZero: d.kind === 'FIXED_UNIT_PRICE' });
  if (value == null) errors.value = msg(d.kind === 'PERCENTAGE' ? 'merch.dialog.errors.percent' : 'merch.dialog.errors.price');
  else if (d.kind === 'PERCENTAGE' && compareMoney(value, '100.00') > 0) errors.value = msg('merch.dialog.errors.percent');
  const productIds = d.productMode === 'ALL' ? [] : [...new Set(d.productIds)];
  const categoryIds = d.productMode === 'ALL' ? [] : [...new Set(d.categoryIds)];
  const buyerIds = d.buyerMode === 'ALL' ? [] : [...new Set(d.buyerIds)];
  if (d.productMode === 'SELECTED' && productIds.length + categoryIds.length === 0) errors.products = msg('merch.dialog.errors.products');
  if (productIds.length > PROMOTION_TARGETS_MAX || categoryIds.length > PROMOTION_TARGETS_MAX)
    errors.products = msg('merch.dialog.errors.tooMany', { max: PROMOTION_TARGETS_MAX });
  if (d.buyerMode === 'SELECTED' && buyerIds.length === 0) errors.buyers = msg('merch.dialog.errors.buyers');
  if (buyerIds.length > PROMOTION_TARGETS_MAX) errors.buyers = msg('merch.dialog.errors.tooMany', { max: PROMOTION_TARGETS_MAX });
  const startsAt = toCountryLocalTime(d.startsAt, country);
  const endsAt = toCountryLocalTime(d.endsAt, country);
  if (!startsAt) errors.startsAt = msg('merch.dialog.errors.date');
  if (!endsAt) errors.endsAt = msg('merch.dialog.errors.date');
  else if (startsAt && localTimeInstant(endsAt) <= localTimeInstant(startsAt)) errors.endsAt = msg('merch.dialog.errors.endAfterStart');
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      kind: d.kind,
      value: value!,
      productMode: d.productMode,
      productIds,
      categoryIds,
      buyerMode: d.buyerMode,
      buyerIds,
      startsAt: startsAt!,
      endsAt: endsAt!,
    },
  };
}
