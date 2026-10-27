import { api, data, download } from '../api/client';
import type { Export, ExportRequest, ReportBucket } from '../api/models';
import { addDays } from '../format';
import { divideMoney } from '../money';

/*
 * Business reports and CSV exports (FRONTEND_HANDOFF "Business reporting handoff",
 * "CSV export handoff"):
 *  - Delivered orders only, selected by the frozen submission date in the organization's
 *    country (Europe/Belgrade / Europe/Sarajevo). Inclusive ISO dates; no future dates.
 *  - Summary: grouping DAY (≤ 366 inclusive days) or MONTH (≤ 60 inclusive calendar months).
 *    Product/buyer tables: ≤ 60 calendar months, offset pages. Buyers report is vendor-only.
 *  - Amounts are exact decimal strings, NET_EXCLUDING_VAT; never re-rounded except for the
 *    derived average below (shown as such).
 *  - Exports: client UUIDv7 per intent (no Idempotency-Key), 202 QUEUED, poll GET until READY,
 *    then download the CSV. Requester-only; no list endpoint.
 */

export type ReportGrouping = 'DAY' | 'MONTH';
export interface ReportRange {
  from: string;
  to: string;
}
export interface ReportSummaryRange extends ReportRange {
  grouping: ReportGrouping;
}

export const REPORT_RANGE_PRESETS = ['7d', '30d', '90d', '12m', 'ytd', '5y'] as const;
export type ReportRangePreset = (typeof REPORT_RANGE_PRESETS)[number];
export const DEFAULT_REPORT_RANGE: ReportRangePreset = '90d';

export const REPORT_MAX_DAY_BUCKETS = 366;
export const REPORT_MAX_MONTHS = 60;
/** Custom ranges up to this many days chart per day; longer ones per month. */
const DAILY_UP_TO_DAYS = 92;

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

function firstOfMonthsBack(today: string, monthsBack: number): string {
  const [y, m] = parts(today);
  const index = y * 12 + (m - 1) - monthsBack;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

/** Inclusive day count of a range. */
export function reportDaysInRange(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

/** Inclusive calendar-month count of a range (a partial month counts). */
export function reportMonthsInRange(from: string, to: string): number {
  const [fy, fm] = parts(from);
  const [ty, tm] = parts(to);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** A preset as concrete country-local dates ending today (`today` from localToday()). */
export function presetReportRange(preset: ReportRangePreset, today: string): ReportSummaryRange {
  switch (preset) {
    case '7d':
      return { from: addDays(today, -6), to: today, grouping: 'DAY' };
    case '30d':
      return { from: addDays(today, -29), to: today, grouping: 'DAY' };
    case '90d':
      return { from: addDays(today, -89), to: today, grouping: 'DAY' };
    case '12m':
      return { from: firstOfMonthsBack(today, 11), to: today, grouping: 'MONTH' };
    case 'ytd':
      return { from: `${today.slice(0, 4)}-01-01`, to: today, grouping: 'MONTH' };
    case '5y':
      return { from: firstOfMonthsBack(today, REPORT_MAX_MONTHS - 1), to: today, grouping: 'MONTH' };
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const [y, m, d] = parts(date);
  const value = new Date(Date.UTC(y, m - 1, d));
  return value.getUTCFullYear() === y && value.getUTCMonth() === m - 1 && value.getUTCDate() === d;
}

export type ReportRangeProblem = 'INVALID_DATE' | 'REVERSED' | 'FUTURE' | 'TOO_LONG';

/** Client-side check of a custom range against the backend's rules (it validates again). */
export function reportRangeProblem(range: ReportRange, today: string): ReportRangeProblem | null {
  if (!isRealDate(range.from) || !isRealDate(range.to)) return 'INVALID_DATE';
  if (range.from > range.to) return 'REVERSED';
  if (range.to > today) return 'FUTURE';
  if (reportMonthsInRange(range.from, range.to) > REPORT_MAX_MONTHS) return 'TOO_LONG';
  return null;
}

/** ReportGrouping for a custom range: per day for short ranges, otherwise per month. */
export function reportGroupingFor(range: ReportRange): ReportGrouping {
  return reportDaysInRange(range.from, range.to) <= Math.min(DAILY_UP_TO_DAYS, REPORT_MAX_DAY_BUCKETS) ? 'DAY' : 'MONTH';
}

export function customReportRange(range: ReportRange): ReportSummaryRange {
  return { ...range, grouping: reportGroupingFor(range) };
}

/** Whether a series has anything to chart (an all-zero chart reads as broken). */
export function reportHasActivity(buckets: Pick<ReportBucket, 'orderCount'>[]): boolean {
  return buckets.some((b) => b.orderCount > 0);
}

/** Exact average order value (half-up, two decimals); null without orders so screens show a dash. */
export const averageAmount = divideMoney;

let reportQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs report reads one at a time. Each report holds the organization's authorization lock
 * while it computes, so parallel reports from one organization collide and the later ones get
 * 503 after the 2 s lock wait (verified locally). A stats page asks for summary, products and
 * buyers together; queuing them costs a little latency and avoids the failures.
 */
export function oneReportAtATime<T>(read: () => Promise<T>): Promise<T> {
  const next = reportQueue.then(read, read);
  reportQueue = next.catch(() => undefined);
  return next;
}

export interface ReportTableQuery extends ReportRange {
  page: number;
  size?: number;
}

export const reportKeys = {
  all: ['reports'] as const,
  summary: (r: ReportSummaryRange) => ['reports', 'summary', r] as const,
  products: (q: ReportTableQuery) => ['reports', 'products', q] as const,
  buyers: (q: ReportTableQuery) => ['reports', 'buyers', q] as const,
  export: (id: string) => ['exports', id] as const,
};

const tableParams = (q: ReportTableQuery) => ({ from: q.from, to: q.to, page: q.page, size: q.size ?? 25, includeTotal: true });

export const reportQueries = {
  summary: (r: ReportSummaryRange) => ({
    queryKey: reportKeys.summary(r),
    queryFn: () => oneReportAtATime(() => data(api.GET('/reports/summary', { params: { query: { from: r.from, to: r.to, grouping: r.grouping } } }))),
  }),
  products: (q: ReportTableQuery) => ({
    queryKey: reportKeys.products(q),
    queryFn: () => oneReportAtATime(() => data(api.GET('/reports/products', { params: { query: tableParams(q) } }))),
  }),
  /** Vendor organizations only. */
  buyers: (q: ReportTableQuery) => ({
    queryKey: reportKeys.buyers(q),
    queryFn: () => oneReportAtATime(() => data(api.GET('/reports/buyers', { params: { query: tableParams(q) } }))),
  }),
  export: (exportId: string) => ({
    queryKey: reportKeys.export(exportId),
    queryFn: () => data(api.GET('/exports/{exportId}', { params: { path: { exportId } } })),
  }),
};

export type ReportExportKind = ExportRequest['kind'];
/** ORDERS: every order state; report kinds: the delivered-only report rows. REPORT_BUYERS is vendor-only. */
export const REPORT_EXPORT_KINDS: readonly ReportExportKind[] = ['ORDERS', 'REPORT_PRODUCTS', 'REPORT_BUYERS'];

/** Generate `id` (uuidv7) once per export intent and reuse it when retrying that same request. */
export function requestReportExport(input: ExportRequest): Promise<Export> {
  return data(api.POST('/exports', { body: input }));
}

/** The finished CSV (UTF-8, no BOM). Rejects with ApiError 409 INVALID_STATE / EXPORT_EXPIRED. */
export async function downloadReportExport(exportId: string): Promise<string> {
  const response = await download(`/exports/${encodeURIComponent(exportId)}/content`, { headers: { Accept: 'text/csv' } });
  return response.text();
}

export function reportExportFileName(kind: ReportExportKind, range: ReportRange): string {
  return `${kind.toLowerCase().replace(/_/g, '-')}_${range.from}_${range.to}.csv`;
}

/** Bounded polling backoff while an export is QUEUED: 2 s, 4 s, 8 s, then every 15 s. */
export function reportExportPollDelay(attempt: number): number {
  return Math.min(15_000, 2_000 * 2 ** Math.max(0, attempt));
}

/** Failure codes the worker records on a FAILED export (each has an i18n message under repExport.failure). */
export const REPORT_EXPORT_FAILURE_CODES = ['EXPORT_ROW_LIMIT', 'EXPORT_SIZE_LIMIT', 'EXPORT_CAPACITY_REACHED', 'REPORT_OVERFLOW', 'ACCESS_REVOKED'] as const;

/**
 * Vendor dashboard reads. Keys sit under the owning areas' prefixes (['orders'], ['promotions'])
 * so their mutations' invalidations refresh the dashboard too.
 */
export const dashboardQueries = {
  recentOrders: (size = 5) => ({
    queryKey: ['orders', 'dashboard', 'recent', size] as const,
    queryFn: async () => (await data(api.GET('/orders', { params: { query: { size } } }))).items,
  }),
  /** Orders waiting for the vendor's decision; cursor lists have no total, so this counts up to 100. */
  awaitingAcceptance: () => ({
    queryKey: ['orders', 'dashboard', 'awaiting'] as const,
    queryFn: async () => {
      const page = await data(api.GET('/orders', { params: { query: { state: 'AWAITING_ACCEPTANCE', size: 100 } } }));
      return { count: page.items.length, more: page.nextCursor !== null };
    },
  }),
  runningPromotions: () => ({
    queryKey: ['promotions', 'dashboard', 'running'] as const,
    queryFn: async () => (await data(api.GET('/promotions', { params: { query: { state: 'RUNNING', size: 1, includeTotal: true } } }))).total ?? 0,
  }),
};
