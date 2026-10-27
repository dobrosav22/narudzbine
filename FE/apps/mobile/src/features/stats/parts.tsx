import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  DEFAULT_REPORT_RANGE,
  formatLocalDate,
  formatMoney,
  formatMonth,
  formatNumber,
  localToday,
  presetReportRange,
  REPORT_RANGE_PRESETS,
  type Currency,
  type ReportBucket,
  type ReportGrouping,
  type ReportRangePreset,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { Chip } from '@/components/ui/chip';
import { useT } from '@/lib/i18n';

function bucketLabel(periodStart: string, grouping: ReportGrouping): string {
  return grouping === 'DAY' ? formatLocalDate(periodStart) : formatMonth(periodStart, 'long');
}

/**
 * Goods total per period drawn with Views (no chart library on native; web uses recharts for
 * the same data). One accessible image listing the non-empty periods. Axis labels are sparse so
 * up to 31 day bars stay readable.
 */
export function PeriodBars({
  buckets,
  grouping,
  currency,
  label,
  height = 120,
}: {
  buckets: ReportBucket[];
  grouping: ReportGrouping;
  currency: Currency;
  label: string;
  height?: number;
}) {
  const t = useT('stats');
  const values = buckets.map((b) => Number(b.goodsTotal));
  const max = Math.max(1, ...values);
  const every = Math.max(1, Math.ceil(buckets.length / 6));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${t('chartAria', { label })}: ${buckets
        .filter((b) => b.orderCount > 0)
        .map((b) => `${bucketLabel(b.periodStart, grouping)} ${formatMoney(b.goodsTotal, currency)}`)
        .join(', ')}`}
      className="gap-2">
      <View className="flex-row items-end gap-0.5" style={{ height }}>
        {buckets.map((b, i) => (
          <View key={b.periodStart} className="flex-1 justify-end" style={{ height }}>
            <View className="w-full rounded-t-sm bg-chart-2" style={{ height: Math.max(2, Math.round((values[i]! / max) * height)) }} />
          </View>
        ))}
      </View>
      <View className="flex-row gap-0.5">
        {buckets.map((b, i) => (
          <AppText key={b.periodStart} numberOfLines={1} className="flex-1 text-center text-[10px] text-muted-foreground">
            {i % every === 0 ? (grouping === 'DAY' ? formatNumber(Number(b.periodStart.slice(8, 10))) : formatMonth(b.periodStart)) : ''}
          </AppText>
        ))}
      </View>
    </View>
  );
}

/** One headline number, two per row. Mirrors web's StatCard. */
export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-card p-4">
      <AppText className="text-sm text-muted-foreground">{label}</AppText>
      <AppText mono weight="semibold" className="text-lg text-card-foreground">
        {value}
      </AppText>
    </View>
  );
}

/** Report range presets (custom dates are web-only). */
export function useRangeChips(initial: ReportRangePreset = DEFAULT_REPORT_RANGE) {
  const [preset, setPreset] = useState<ReportRangePreset>(initial);
  return { preset, setPreset, range: presetReportRange(preset, localToday()) };
}

export function RangeChips({ value, onChange }: { value: ReportRangePreset; onChange: (p: ReportRangePreset) => void }) {
  const t = useT('dateRanges.preset');
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
      {REPORT_RANGE_PRESETS.map((p) => (
        <Chip key={p} role="radio" label={t(p)} selected={value === p} onPress={() => onChange(p)} />
      ))}
    </ScrollView>
  );
}

/** Section heading, CSS-uppercased like the Account screen's sections. */
export function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <AppText weight="medium" className="text-xs uppercase tracking-wide text-muted-foreground">
        {children}
      </AppText>
      {action}
    </View>
  );
}
