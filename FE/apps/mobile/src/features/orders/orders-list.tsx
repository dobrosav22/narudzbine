import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  formatDate,
  formatMoney,
  formatNumber,
  localToday,
  orderDateRange,
  orderPartner,
  ORDER_DATE_PRESETS,
  ORDER_STATES,
  pageItems,
  type OrderDatePreset,
  type OrderState,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Chip } from '@/components/ui/chip';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';
import { useOrderList, useOrderPartners } from './queries';
import { OrderStateBadge } from './state-badge';

/** Order history for either side (GET /orders): state, partner and period chips, cursor-paged on scroll. Mirrors web. */
export function OrdersList({ side }: { side: 'BUYER' | 'VENDOR' }) {
  const c = useTokenColors();
  const t = useT('orders');
  const ts = useT('ordState');
  const tmo = useT('mOrders');
  const [state, setState] = useState<OrderState>();
  const [partnerId, setPartnerId] = useState<string>();
  // Deep links from partner details and the dashboard (`?partnerId=…`, `?state=…`). The tab stays
  // mounted, so each new link re-applies its filter instead of being read only on first render.
  const linked = useLocalSearchParams<{ partnerId?: string; state?: string }>();
  const linkKey = `${linked.partnerId ?? ''}|${linked.state ?? ''}`;
  const [appliedLink, setAppliedLink] = useState('|');
  if (linkKey !== appliedLink) {
    setAppliedLink(linkKey);
    if (linked.partnerId) setPartnerId(linked.partnerId);
    if (linked.state && (ORDER_STATES as readonly string[]).includes(linked.state)) setState(linked.state as OrderState);
  }
  const [preset, setPreset] = useState<OrderDatePreset>('all');
  const [dates, setDates] = useState<{ from?: string; to?: string }>({});
  const partners = useOrderPartners();
  const orders = useOrderList({ state, partnerId, ...dates });
  const filtering = !!(state || partnerId || preset !== 'all');

  if (orders.isError) return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />;
  if (!orders.data) return <LoadingState label={tmo('loading')} />;
  const rows = pageItems(orders.data.pages);
  const path = side === 'BUYER' ? '/buyer/order/[id]' : '/vendor/order/[id]';

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      data={rows}
      keyExtractor={(o) => o.id}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (orders.hasNextPage && !orders.isFetchingNextPage) void orders.fetchNextPage();
      }}
      ListHeaderComponent={
        <View className="gap-2 py-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            <Chip role="radio" label={t('allStates')} selected={!state} onPress={() => setState(undefined)} />
            {ORDER_STATES.map((s) => (
              <Chip key={s} role="radio" label={ts(s)} selected={state === s} onPress={() => setState(s)} />
            ))}
          </ScrollView>
          {partners.data && partners.data.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
              <Chip role="radio" label={side === 'BUYER' ? t('allVendors') : t('allBuyers')} selected={!partnerId} onPress={() => setPartnerId(undefined)} />
              {partners.data.map((p) => (
                <Chip
                  key={p.id}
                  role="radio"
                  label={p.relationshipState === 'DISCONNECTED' ? t('partnerDisconnected', { name: p.displayName }) : p.displayName}
                  selected={partnerId === p.id}
                  onPress={() => setPartnerId(p.id)}
                />
              ))}
            </ScrollView>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            {ORDER_DATE_PRESETS.map((p) => (
              <Chip
                key={p}
                role="radio"
                label={t(`range.${p}`)}
                selected={preset === p}
                onPress={() => {
                  setPreset(p);
                  setDates(orderDateRange(p, localToday()));
                }}
              />
            ))}
          </ScrollView>
        </View>
      }
      renderItem={({ item: o }) => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={tmo('orderAria', { number: o.number })}
          onPress={() => router.push({ pathname: path, params: { id: o.id } })}
          className="gap-1.5 px-4 py-3 active:bg-muted">
          <View className="flex-row items-center justify-between gap-3">
            <AppText mono weight="semibold" className="text-base text-foreground">
              {o.number}
            </AppText>
            <OrderStateBadge state={o.state} stageName={o.stageName} />
          </View>
          <View className="flex-row justify-between gap-3">
            <AppText className="flex-1 text-sm text-muted-foreground" numberOfLines={1}>
              {`${orderPartner(o, side).displayName} · ${formatDate(o.submittedAt)} · ${tmo('items', { count: o.lines.length, countText: formatNumber(o.lines.length) })}`}
            </AppText>
            <AppText mono className="text-sm text-foreground">
              {formatMoney(o.goodsTotal, o.currency)}
            </AppText>
          </View>
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={
        <EmptyState
          title={filtering ? t('noMatchesTitle') : t('emptyTitle')}
          description={filtering ? t('noMatchesDescription') : side === 'BUYER' ? t('emptyBuyer') : t('emptyVendor')}
        />
      }
      ListFooterComponent={
        rows.length > 0 ? (
          <View className="items-center gap-2 p-4">
            {orders.isFetchingNextPage && <ActivityIndicator color={c.primary} />}
            <AppText className="text-xs text-muted-foreground">{t('netNote')}</AppText>
          </View>
        ) : null
      }
      refreshControl={<RefreshControl refreshing={orders.isRefetching && !orders.isFetchingNextPage} onRefresh={() => void orders.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}
