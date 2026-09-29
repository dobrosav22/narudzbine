import type { PeriodBucket, StatsPeriod } from '../types';

/** Period filter options, shared by every stats screen. */
export const STATS_PERIODS: { value: StatsPeriod; labelKey: string }[] = [
  { value: '30d', labelKey: 'periods.30d' },
  { value: '90d', labelKey: 'periods.90d' },
  { value: '12m', labelKey: 'periods.12m' },
  { value: 'all', labelKey: 'periods.all' },
];

export const DEFAULT_STATS_PERIOD: StatsPeriod = '90d';

/** Translation key for a period's name. */
export function periodKey(period: StatsPeriod): string {
  return STATS_PERIODS.find((p) => p.value === period)?.labelKey ?? 'periods.all';
}

/** Spend or revenue per order; 0 when there are no orders (never NaN on screen). */
export function averageOrderValue(total: number, orderCount: number): number {
  return orderCount > 0 ? Math.round((total / orderCount) * 100) / 100 : 0;
}

/** Whether a series has anything to chart — an all-zero chart reads as broken, so screens show an empty state. */
export function hasActivity(buckets: PeriodBucket[]): boolean {
  return buckets.some((b) => b.orderCount > 0);
}

/** Highest bucket value, for scaling hand-drawn bars (mobile). At least 1 so empty series don't divide by zero. */
export function maxRevenue(buckets: PeriodBucket[]): number {
  return Math.max(1, ...buckets.map((b) => b.revenue));
}
