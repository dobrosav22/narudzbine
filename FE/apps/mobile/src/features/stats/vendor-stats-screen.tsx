import { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  averageOrderValue,
  DEFAULT_STATS_PERIOD,
  formatDate,
  formatMoney,
  formatNumber,
  type BuyerStat,
  type ProductStat,
  type StatsPeriod,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Chip } from '@/components/ui/chip';
import { useVendorOrderContext } from '@/features/vendor-orders/queries';
import { PeriodChips } from './parts';
import { useBuyerStats, useProductStats } from './queries';
import { useT } from '@/lib/i18n';

type StatsView = 'products' | 'buyers';

/** 03 → vendor "Stats module" on mobile: by product / by buyer, period and warehouse filters. */
export function VendorStatsScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useT('stats');
  const tmo = useT('m.stats');
  const [view, setView] = useState<StatsView>('products');
  const [period, setPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD);
  const [locationId, setLocationId] = useState<string>();
  const filter = { period, locationId };
  const products = useProductStats(vendorOrgId, filter, view === 'products');
  const buyers = useBuyerStats(vendorOrgId, filter, view === 'buyers');
  const context = useVendorOrderContext(vendorOrgId);
  const warehouses = [...(context.data?.vendorLocations.values() ?? [])];
  const query = view === 'products' ? products : buyers;

  const header = (
    <View className="gap-2 py-3">
      <View className="flex-row gap-2 px-4">
        <Chip role="radio" label={t('byProduct')} selected={view === 'products'} onPress={() => setView('products')} />
        <Chip role="radio" label={t('byBuyer')} selected={view === 'buyers'} onPress={() => setView('buyers')} />
      </View>
      <PeriodChips value={period} onChange={setPeriod} />
      {warehouses.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
          <Chip role="radio" label={t('allWarehouses')} selected={!locationId} onPress={() => setLocationId(undefined)} />
          {warehouses.map((w) => (
            <Chip key={w.id} role="radio" label={w.name} selected={locationId === w.id} onPress={() => setLocationId(w.id)} />
          ))}
        </ScrollView>
      )}
      <AppText className="px-4 text-xs text-muted-foreground">{tmo('cancelledExcluded')}</AppText>
    </View>
  );

  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return view === 'products' ? (
    <FlatList<ProductStat>
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      data={products.data ?? []}
      keyExtractor={(p) => p.productId}
      ListHeaderComponent={header}
      renderItem={({ item: p }) => (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/vendor/product/[id]', params: { id: p.productId } })}
          className="gap-1 px-4 py-3 active:bg-muted">
          <View className="flex-row items-center justify-between gap-3">
            <AppText weight="medium" className="flex-1 text-base text-foreground" numberOfLines={1}>
              {p.productName}
            </AppText>
            <AppText mono weight="medium" className="text-base text-foreground">
              {formatMoney(p.revenue)}
            </AppText>
          </View>
          <AppText className="text-sm text-muted-foreground">
            {`${formatNumber(p.units)} ${p.unit} · ${t('orders', { count: p.orderCount, countText: formatNumber(p.orderCount) })}`}
          </AppText>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={
        products.isPending ? <LoadingState label={tmo('loading')} /> : <EmptyState title={t('noSalesTitle')} description={tmo('noSalesDescription')} />
      }
    />
  ) : (
    <FlatList<BuyerStat>
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      data={buyers.data ?? []}
      keyExtractor={(b) => b.buyerOrgId}
      ListHeaderComponent={header}
      renderItem={({ item: b }) => (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/vendor/buyer/[id]', params: { id: b.buyerOrgId } })}
          className="gap-1 px-4 py-3 active:bg-muted">
          <View className="flex-row items-center justify-between gap-3">
            <AppText weight="medium" className="flex-1 text-base text-foreground" numberOfLines={1}>
              {b.buyerName}
            </AppText>
            <AppText mono weight="medium" className="text-base text-foreground">
              {formatMoney(b.spend)}
            </AppText>
          </View>
          <AppText className="text-sm text-muted-foreground">
            {b.orderCount
              ? tmo('buyerLine', {
                  orders: t('orders', { count: b.orderCount, countText: formatNumber(b.orderCount) }),
                  avg: formatMoney(averageOrderValue(b.spend, b.orderCount)),
                  last: formatDate(b.lastOrderAt!),
                })
              : t('noOrdersTitle')}
          </AppText>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={
        buyers.isPending ? <LoadingState label={tmo('loading')} /> : <EmptyState title={t('noBuyersTitle')} description={tmo('noBuyersDescription')} />
      }
    />
  );
}
