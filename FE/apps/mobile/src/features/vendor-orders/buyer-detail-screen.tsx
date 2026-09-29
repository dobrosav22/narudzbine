import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { formatDate, formatMoney, formatNumber, isServiceError, orderNumber, orderTotal } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { StatusBadge } from '@/features/orders/status-badge';
import { useBuyerDetail, useRemoveConnection, useStatusConfig } from './queries';
import { useT } from '@/lib/i18n';

/** 03 → vendor per-buyer detail on mobile: prices, orders, disconnect. */
export function BuyerDetailScreen({ vendorOrgId, buyerOrgId }: { vendorOrgId: string; buyerOrgId: string }) {
  const t = useT('vendorBuyers');
  const td = useT('vendorBuyers.detail');
  const tmo = useT('m.buyers');
  const tmr = useT('m.orders');
  const detail = useBuyerDetail(vendorOrgId, buyerOrgId);
  const config = useStatusConfig(vendorOrgId);
  const disconnect = useRemoveConnection(vendorOrgId);
  const [confirm, setConfirm] = useState(false);

  if (detail.isError) {
    return isServiceError(detail.error, 'NOT_FOUND') ? (
      <EmptyState title={td('notFoundTitle')} description={td('notFoundDescription')} />
    ) : (
      <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
    );
  }
  if (detail.isPending) return <LoadingState label={tmo('loadingOne')} />;
  const { buyerOrg, relation, overrides, orders, stats } = detail.data;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-12">
      <Stack.Screen options={{ title: buyerOrg.name }} />
      <View className="gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <AppText weight="semibold" className="text-xl text-foreground">
            {buyerOrg.name}
          </AppText>
          {relation.status === 'active' ? <Badge variant="success">{t('connected')}</Badge> : <Badge variant="info">{t('inviteSent')}</Badge>}
        </View>
        {relation.joinedAt && <AppText className="text-sm text-muted-foreground">{td('since', { date: formatDate(relation.joinedAt) })}</AppText>}
      </View>

      <View className="flex-row gap-2">
        {[
          [t('orders'), formatNumber(stats?.orderCount ?? 0)],
          [t('spend'), formatMoney(stats?.spend ?? 0)],
        ].map(([label, value]) => (
          <View key={label} className="flex-1 gap-0.5 rounded-xl border border-border bg-card p-3">
            <AppText className="text-xs text-muted-foreground">{label}</AppText>
            <AppText mono weight="semibold" className="text-lg text-card-foreground">
              {value}
            </AppText>
          </View>
        ))}
      </View>

      <Card>
        <CardHeader title={td('prices')} description={tmo('pricesDescription')} />
        {overrides.length === 0 ? (
          <AppText className="text-sm text-muted-foreground">{tmo('pricesEmpty', { name: buyerOrg.name })}</AppText>
        ) : (
          overrides.map((o) => (
            <View key={o.id} className="flex-row justify-between gap-3">
              <AppText className="flex-1 text-sm text-foreground" numberOfLines={2}>
                {o.product?.name ?? td('deletedProduct')}
              </AppText>
              <View className="items-end">
                <AppText mono className="text-sm text-foreground">
                  {formatMoney(o.price)}
                </AppText>
                {o.product && (
                  <AppText mono className="text-xs text-muted-foreground line-through">
                    {formatMoney(o.product.basePrice)}
                  </AppText>
                )}
              </View>
            </View>
          ))
        )}
      </Card>

      <Card>
        <CardHeader title={t('orders')} />
        {orders.length === 0 ? (
          <AppText className="text-sm text-muted-foreground">{td('noOrders')}</AppText>
        ) : (
          orders.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="link"
              accessibilityLabel={tmr('orderAria', { number: orderNumber(o) })}
              onPress={() => router.push({ pathname: '/vendor/order/[id]', params: { id: o.id } })}
              className="flex-row items-center justify-between gap-3 py-1 active:bg-muted">
              <View>
                <AppText mono weight="medium" className="text-sm text-foreground">
                  {orderNumber(o)}
                </AppText>
                <AppText className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</AppText>
              </View>
              <View className="items-end gap-1">
                <AppText mono className="text-sm text-foreground">
                  {formatMoney(orderTotal(o))}
                </AppText>
                <StatusBadge config={config.data} statusKey={o.statusKey} />
              </View>
            </Pressable>
          ))
        )}
      </Card>

      {confirm ? (
        <View accessibilityRole="alert" className="gap-2 rounded-lg border border-border bg-card p-3">
          <AppText className="text-sm text-foreground">
            {tmo('disconnectConfirm', { name: buyerOrg.name })}
          </AppText>
          <View className="flex-row gap-2">
            <Button size="sm" variant="outline" onPress={() => setConfirm(false)}>
              {td('keep')}
            </Button>
            <Button size="sm" variant="destructive" loading={disconnect.isPending} onPress={() => disconnect.mutate(buyerOrg.id, { onSuccess: () => router.back() })}>
              {td('disconnect')}
            </Button>
          </View>
          {disconnect.error ? <FormError error={disconnect.error} /> : null}
        </View>
      ) : (
        <Button variant="destructive" onPress={() => setConfirm(true)}>
          {tmo('disconnectBuyer')}
        </Button>
      )}
    </ScrollView>
  );
}
