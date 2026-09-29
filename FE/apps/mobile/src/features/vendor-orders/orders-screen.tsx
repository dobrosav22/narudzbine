import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  formatDate,
  formatMoney,
  isOpenOrder,
  ORDER_DATE_RANGES,
  orderNumber,
  orderRangeStart,
  orderTotal,
  statusLabel,
  type OrderDateRange,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Chip } from '@/components/ui/chip';
import { StatusBadge } from '@/features/orders/status-badge';
import { useTokenColors } from '@/theme';
import { useVendorOrderContext, useVendorOrders } from './queries';
import { useMsg, useT } from '@/lib/i18n';

const OPEN = '__open';

/** 03 → vendor "Orders (list)" on mobile: status (incl. open), buyer, warehouse (2+ only) and date range — same filters as web. */
export function VendorOrdersScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const c = useTokenColors();
  const t = useT('vendorOrders');
  const to = useT('orders');
  const tmo = useT('m.orders');
  const tmc = useT('m.common');
  const tm = useMsg();
  const [status, setStatus] = useState<string>();
  const [buyerOrgId, setBuyerOrgId] = useState<string>();
  const [locationId, setLocationId] = useState<string>();
  const [range, setRange] = useState<OrderDateRange>('all');
  // Computed when the range is picked (an event), not during render.
  const [from, setFrom] = useState<string>();
  const ctx = useVendorOrderContext(vendorOrgId);
  const orders = useVendorOrders(vendorOrgId, { statusKey: status === OPEN ? undefined : status, buyerOrgId, locationId, from });

  if (ctx.isError || orders.isError) {
    return <ErrorState error={ctx.error ?? orders.error} onRetry={() => void Promise.all([ctx.refetch(), orders.refetch()])} />;
  }
  if (!ctx.data || !orders.data) return <LoadingState label={tmo('loading')} />;
  const context = ctx.data;
  const warehouses = [...context.vendorLocations.values()];
  const filtering = !!(status || buyerOrgId || locationId || from);
  const rows = status === OPEN ? orders.data.filter((o) => isOpenOrder(context.config, o)) : orders.data;

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      data={rows}
      keyExtractor={(o) => o.id}
      ListHeaderComponent={
        <View className="gap-2 py-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            <Chip role="radio" label={tmc('all')} selected={!status} onPress={() => setStatus(undefined)} />
            <Chip role="radio" label={tmo('open')} selected={status === OPEN} onPress={() => setStatus(OPEN)} />
            {context.config.statuses.map((s) => (
              <Chip key={s.key} role="radio" label={tm(statusLabel(s))} selected={status === s.key} onPress={() => setStatus(s.key)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            <Chip role="radio" label={t('allBuyers')} selected={!buyerOrgId} onPress={() => setBuyerOrgId(undefined)} />
            {[...context.buyers.values()].map((b) => (
              <Chip key={b.id} role="radio" label={b.name} selected={buyerOrgId === b.id} onPress={() => setBuyerOrgId(b.id)} />
            ))}
          </ScrollView>
          {/* One warehouse fulfils everything, so the filter would change nothing. */}
          {warehouses.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
              <Chip role="radio" label={t('allWarehouses')} selected={!locationId} onPress={() => setLocationId(undefined)} />
              {warehouses.map((w) => (
                <Chip key={w.id} role="radio" label={w.name} selected={locationId === w.id} onPress={() => setLocationId(w.id)} />
              ))}
            </ScrollView>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            {ORDER_DATE_RANGES.map((r) => (
              <Chip
                key={r.value}
                role="radio"
                label={tm({ key: r.longKey })}
                selected={range === r.value}
                onPress={() => {
                  setRange(r.value);
                  setFrom(orderRangeStart(r.value));
                }}
              />
            ))}
          </ScrollView>
        </View>
      }
      renderItem={({ item: o }) => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={tmo('orderAria', { number: orderNumber(o) })}
          onPress={() => router.push({ pathname: '/vendor/order/[id]', params: { id: o.id } })}
          className="gap-1.5 px-4 py-3 active:bg-muted">
          <View className="flex-row items-center justify-between gap-3">
            <AppText mono weight="semibold" className="text-base text-foreground">
              {orderNumber(o)}
            </AppText>
            <StatusBadge config={context.config} statusKey={o.statusKey} />
          </View>
          <View className="flex-row justify-between gap-3">
            <AppText className="flex-1 text-sm text-muted-foreground" numberOfLines={1}>
              {`${context.buyers.get(o.buyerOrgId)?.name ?? t('formerBuyer')} · ${formatDate(o.createdAt)}`}
            </AppText>
            <AppText mono className="text-sm text-foreground">
              {formatMoney(orderTotal(o))}
            </AppText>
          </View>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={
        <EmptyState
          title={filtering ? to('noMatchesTitle') : to('emptyTitle')}
          description={filtering ? t('noMatchesDescription') : t('emptyDescription')}
        />
      }
      refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}
