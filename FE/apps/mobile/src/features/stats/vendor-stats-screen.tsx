import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import {
  averageAmount,
  formatDate,
  formatMoney,
  formatNumber,
  reportHasActivity,
  type BuyerReport,
  type Currency,
  type ProductReport,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import { PeriodBars, RangeChips, StatTile, useRangeChips } from './parts';
import { useBuyerReportPages, useProductReportPages, useReportSummary } from './queries';

type Tab = 'products' | 'buyers';

function average(total: string, count: number, currency: Currency): string {
  const a = averageAmount(total, count);
  return a === null ? '—' : formatMoney(a, currency);
}

/**
 * Stats on mobile (vendor and buyer): delivered orders in a preset country-local range — totals,
 * per-period bars, and sales by product (and by buyer for vendors). CSV exports are web-only.
 */
export function StatsScreen({ vendor }: { vendor: boolean }) {
  const t = useT('stats');
  const tmo = useT('mStats');
  const { organization } = useBusiness();
  const currency = organization.currency;
  const { preset, setPreset, range } = useRangeChips();
  const [tab, setTab] = useState<Tab>('products');
  const summary = useReportSummary(range);
  const products = useProductReportPages(range, tab === 'products');
  const buyers = useBuyerReportPages(range, vendor && tab === 'buyers');
  const list = tab === 'products' || !vendor ? products : buyers;

  const header = (
    <View className="gap-4 py-3">
      <RangeChips value={preset} onChange={setPreset} />
      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.data ? (
        <View className="gap-4 px-4">
          <View className="flex-row flex-wrap gap-3">
            <StatTile label={vendor ? t('goodsTotal') : t('spend')} value={formatMoney(summary.data.goodsTotal, currency)} />
            <StatTile label={t('ordersCol')} value={formatNumber(summary.data.orderCount)} />
            <StatTile label={t('averageOrder')} value={average(summary.data.goodsTotal, summary.data.orderCount, currency)} />
            {vendor && <StatTile label={t('activeBuyers')} value={formatNumber(summary.data.activeBuyerCount ?? 0)} />}
          </View>
          <View className="rounded-xl border border-border bg-card p-4">
            {reportHasActivity(summary.data.buckets) ? (
              <PeriodBars buckets={summary.data.buckets} grouping={summary.data.grouping} currency={currency} label={vendor ? t('goodsTotal') : t('spend')} />
            ) : (
              <AppText className="text-sm text-muted-foreground">{t('noActivity')}</AppText>
            )}
          </View>
          <AppText className="text-xs text-muted-foreground">{tmo('basis', { timezone: summary.data.timezone })}</AppText>
        </View>
      ) : (
        <LoadingState />
      )}
      {vendor && (
        <View className="flex-row gap-2 px-4">
          <Chip role="radio" label={t('byProduct')} selected={tab === 'products'} onPress={() => setTab('products')} />
          <Chip role="radio" label={t('byBuyer')} selected={tab === 'buyers'} onPress={() => setTab('buyers')} />
        </View>
      )}
      {!vendor && (
        <AppText weight="medium" className="px-4 text-xs uppercase tracking-wide text-muted-foreground">
          {t('byProduct')}
        </AppText>
      )}
    </View>
  );

  const empty = list.isPending ? (
    <LoadingState />
  ) : list.isError ? (
    <ErrorState error={list.error} onRetry={() => void list.refetch()} />
  ) : tab === 'buyers' && vendor ? (
    <EmptyState title={t('noBuyersTitle')} description={t('noBuyersDescription')} />
  ) : (
    <EmptyState title={t('noSalesTitle')} description={t('noSalesDescription')} />
  );

  if (tab === 'buyers' && vendor) {
    return (
      <FlatList<BuyerReport>
        className="flex-1 bg-background"
        contentContainerClassName="pb-8"
        data={buyers.data?.pages.flatMap((p) => p.items) ?? []}
        keyExtractor={(b) => b.buyerId}
        ListHeaderComponent={header}
        renderItem={({ item: b }) => (
          <View className="gap-1 px-4 py-3">
            <View className="flex-row items-center justify-between gap-3">
              <AppText weight="medium" className="flex-1 text-base text-foreground" numberOfLines={1}>
                {b.displayName}
              </AppText>
              <AppText mono weight="medium" className="text-base text-foreground">
                {formatMoney(b.goodsTotal, currency)}
              </AppText>
            </View>
            <View className="flex-row flex-wrap items-center gap-2">
              <AppText className="text-sm text-muted-foreground">
                {b.lastOrderAt
                  ? tmo('buyerLine', {
                      orders: t('orders', { count: b.orderCount, countText: formatNumber(b.orderCount) }),
                      avg: average(b.goodsTotal, b.orderCount, currency),
                      last: formatDate(b.lastOrderAt),
                    })
                  : t('noOrders')}
              </AppText>
              {!b.activeConnection && <Badge variant="secondary">{t('disconnected')}</Badge>}
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
        onEndReached={() => buyers.hasNextPage && !buyers.isFetchingNextPage && void buyers.fetchNextPage()}
        ListEmptyComponent={empty}
      />
    );
  }

  return (
    <FlatList<ProductReport>
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      data={products.data?.pages.flatMap((p) => p.items) ?? []}
      keyExtractor={(p) => p.productId}
      ListHeaderComponent={header}
      renderItem={({ item: p }) => (
        <Pressable
          accessibilityRole={vendor ? 'link' : undefined}
          disabled={!vendor}
          onPress={() => router.push({ pathname: '/vendor/product/[id]', params: { id: p.productId } })}
          className="gap-1 px-4 py-3 active:bg-muted">
          <View className="flex-row items-center justify-between gap-3">
            <AppText weight="medium" className="flex-1 text-base text-foreground" numberOfLines={1}>
              {p.name}
            </AppText>
            <AppText mono weight="medium" className="text-base text-foreground">
              {formatMoney(p.goodsTotal, currency)}
            </AppText>
          </View>
          <AppText className="text-sm text-muted-foreground">
            {`${formatNumber(p.quantity)} ${p.unitName} · ${t('orders', { count: p.orderCount, countText: formatNumber(p.orderCount) })}`}
          </AppText>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      onEndReached={() => products.hasNextPage && !products.isFetchingNextPage && void products.fetchNextPage()}
      ListEmptyComponent={empty}
    />
  );
}

export function VendorStatsScreen() {
  return <StatsScreen vendor />;
}
