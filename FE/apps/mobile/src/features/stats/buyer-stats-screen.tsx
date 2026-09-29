import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  averageOrderValue,
  DEFAULT_STATS_PERIOD,
  formatMoney,
  formatNumber,
  formatPercent,
  hasActivity,
  type StatsPeriod,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Chip } from '@/components/ui/chip';
import { useBuyerLocations } from '@/features/orders/queries';
import { useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { MonthBars, PeriodChips, SectionTitle, StatTile } from './parts';
import { useBuyerSummary } from './queries';
import { useT } from '@/lib/i18n';

/** 03 → buyer "Own stats" on mobile: spend and order frequency with the active vendor, by product and month. */
export function BuyerStatsScreen() {
  const c = useTokenColors();
  const t = useT('stats');
  const tmo = useT('m.stats');
  const { membership, activeVendor } = useSignedIn();
  const [period, setPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD);
  const [locationId, setLocationId] = useState<string>();
  const scope = activeVendor && { vendorOrgId: activeVendor.id, buyerOrgId: membership.org.id };
  const summary = useBuyerSummary(scope, { period, locationId });
  const locations = useBuyerLocations(membership.org.id);

  if (!activeVendor) return <EmptyState title={t('noVendorsTitle')} description={t('noVendorsDescription')} />;
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  if (summary.isPending) return <LoadingState label={tmo('loadingYours')} />;
  const s = summary.data;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 pb-12 pt-3"
      refreshControl={
        <RefreshControl refreshing={summary.isRefetching} onRefresh={() => void summary.refetch()} tintColor={c.primary} colors={[c.primary]} />
      }>
      <View className="gap-2">
        <AppText className="px-4 text-sm text-muted-foreground">{tmo('yourSpending', { vendor: activeVendor.name })}</AppText>
        <PeriodChips value={period} onChange={setPeriod} />
        {(locations.data?.length ?? 0) > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            <Chip role="radio" label={t('allLocations')} selected={!locationId} onPress={() => setLocationId(undefined)} />
            {locations.data!.map((l) => (
              <Chip key={l.id} role="radio" label={l.name} selected={locationId === l.id} onPress={() => setLocationId(l.id)} />
            ))}
          </ScrollView>
        )}
      </View>

      {s.orderCount === 0 ? (
        <EmptyState title={t('noOrdersTitle')} description={tmo('cancelledDontCount')} />
      ) : (
        <View className="gap-5 px-4">
          <View className="flex-row flex-wrap gap-3">
            <StatTile label={t('totalSpend')} value={formatMoney(s.totalSpend)} />
            <StatTile label={t('ordersCol')} value={formatNumber(s.orderCount)} />
            <StatTile label={t('averageOrder')} value={formatMoney(averageOrderValue(s.totalSpend, s.orderCount))} />
          </View>

          <View className="gap-3">
            <SectionTitle>{t('spendByMonth')}</SectionTitle>
            <View className="rounded-xl border border-border bg-card p-4">
              {hasActivity(s.byPeriod) ? (
                <MonthBars buckets={s.byPeriod} label={t('spend')} />
              ) : (
                <AppText className="text-sm text-muted-foreground">{t('noMonthly')}</AppText>
              )}
            </View>
          </View>

          <View className="gap-3">
            <SectionTitle>{t('byProduct')}</SectionTitle>
            <View className="overflow-hidden rounded-xl border border-border">
              {s.byProduct.map((p, i) => (
                <View key={p.productId}>
                  {i > 0 && <View className="h-px bg-border" />}
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push({ pathname: '/buyer/product/[id]', params: { id: p.productId } })}
                    className="gap-1 bg-background p-3 active:bg-muted">
                    <View className="flex-row items-center justify-between gap-3">
                      <AppText weight="medium" className="flex-1 text-sm text-foreground" numberOfLines={1}>
                        {p.productName}
                      </AppText>
                      <AppText mono className="text-sm text-foreground">
                        {formatMoney(p.spend)}
                      </AppText>
                    </View>
                    <AppText className="text-xs text-muted-foreground">
                      {tmo('productLine', { units: formatNumber(p.units), share: formatPercent(Math.round((p.spend / s.totalSpend) * 1000) / 10) })}
                    </AppText>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
