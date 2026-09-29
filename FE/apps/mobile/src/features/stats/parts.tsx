import { ScrollView, View } from 'react-native';
import { formatMoney, formatMonth, maxRevenue, STATS_PERIODS, type PeriodBucket, type StatsPeriod } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Chip } from '@/components/ui/chip';
import { useMsg, useT } from '@/lib/i18n';

/**
 * Month bars drawn with Views — no chart library on native. Web uses shadcn Chart
 * (recharts) for the same data. Bars use the chart-2 token (05's violet ramp); the
 * whole chart is one accessible image described month by month.
 */
export function MonthBars({ buckets, label, height = 120 }: { buckets: PeriodBucket[]; label: string; height?: number }) {
  const t = useT('stats');
  const max = maxRevenue(buckets);
  const peak = Math.max(...buckets.map((b) => b.revenue));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${t('byMonthAria', { label })}: ${buckets.map((b) => `${formatMonth(b.period, 'long')} ${formatMoney(b.revenue)}`).join(', ')}`}
      className="gap-2">
      <View className="flex-row items-end gap-2" style={{ height }}>
        {buckets.map((b) => (
          <View key={b.period} className="flex-1 items-center justify-end" style={{ height }}>
            <View
              className={`w-full rounded-t-md ${b.revenue === peak && peak > 0 ? 'bg-chart-2' : 'bg-chart-1'}`}
              // A hairline for empty months, so the axis reads as "nothing" rather than missing.
              style={{ height: Math.max(2, Math.round((b.revenue / max) * height)) }}
            />
          </View>
        ))}
      </View>
      <View className="flex-row gap-2">
        {buckets.map((b) => (
          <AppText key={b.period} className="flex-1 text-center text-xs text-muted-foreground">
            {formatMonth(b.period)}
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

export function PeriodChips({ value, onChange }: { value: StatsPeriod; onChange: (p: StatsPeriod) => void }) {
  const tm = useMsg();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
      {STATS_PERIODS.map((p) => (
        <Chip key={p.value} role="radio" label={tm({ key: p.labelKey })} selected={value === p.value} onPress={() => onChange(p.value)} />
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
