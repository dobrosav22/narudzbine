import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { formatDate, formatMoney, formatNumber, orderNumber, orderTotal, statusLabel } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Chip } from '@/components/ui/chip';
import { useCart } from '@/lib/cart';
import { useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useBuyerLocations, useBuyerOrders, useStatusConfig } from './queries';
import { StatusBadge } from './status-badge';
import { useMsg, useT } from '@/lib/i18n';

/** 03 → buyer "Order history" on mobile: filter by location and by the vendor's own statuses. */
export function OrdersScreen() {
  const c = useTokenColors();
  const t = useT('orders');
  const tmo = useT('m.orders');
  const tm = useMsg();
  const { membership, activeVendor } = useSignedIn();
  const { scope } = useCart();
  const [locationId, setLocationId] = useState<string>();
  const [statusKey, setStatusKey] = useState<string>();
  const orders = useBuyerOrders(scope, { locationId, statusKey });
  const config = useStatusConfig(activeVendor?.id ?? '');
  const locations = useBuyerLocations(membership.org.id);

  if (!activeVendor) return <EmptyState title={t('noVendorsTitle')} description={t('noVendorsDescription')} />;
  if (orders.isError) return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />;
  if (!orders.data) return <LoadingState label={tmo('loading')} />;
  const locationName = (id: string) => locations.data?.find((l) => l.id === id)?.name ?? '—';

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      data={orders.data}
      keyExtractor={(o) => o.id}
      ListHeaderComponent={
        <View className="gap-2 py-3">
          {locations.data && locations.data.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
              <Chip role="radio" label={t('allLocations')} selected={!locationId} onPress={() => setLocationId(undefined)} />
              {locations.data.map((l) => (
                <Chip key={l.id} role="radio" label={l.name} selected={locationId === l.id} onPress={() => setLocationId(l.id)} />
              ))}
            </ScrollView>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            <Chip role="radio" label={t('allStatuses')} selected={!statusKey} onPress={() => setStatusKey(undefined)} />
            {config.data?.statuses.map((s) => (
              <Chip key={s.key} role="radio" label={tm(statusLabel(s))} selected={statusKey === s.key} onPress={() => setStatusKey(s.key)} />
            ))}
          </ScrollView>
        </View>
      }
      renderItem={({ item: o }) => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={tmo('orderAria', { number: orderNumber(o) })}
          onPress={() => router.push({ pathname: '/buyer/order/[id]', params: { id: o.id } })}
          className="gap-1.5 px-4 py-3 active:bg-muted">
          <View className="flex-row items-center justify-between gap-3">
            <AppText mono weight="semibold" className="text-base text-foreground">
              {orderNumber(o)}
            </AppText>
            <StatusBadge config={config.data} statusKey={o.statusKey} />
          </View>
          <View className="flex-row justify-between gap-3">
            <AppText className="flex-1 text-sm text-muted-foreground" numberOfLines={1}>
              {`${formatDate(o.createdAt)} · ${locationName(o.locationId)} · ${tmo('items', { count: o.items.reduce((n, i) => n + i.quantity, 0), countText: formatNumber(o.items.reduce((n, i) => n + i.quantity, 0)) })}`}
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
          title={locationId || statusKey ? t('noMatchesTitle') : t('emptyTitle')}
          description={locationId || statusKey ? t('noMatchesDescription') : t('emptyDescription', { vendor: activeVendor.name })}
        />
      }
      refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}
