import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import {
  cancelledStatus,
  formatDateTime,
  formatMoney,
  formatNumber,
  isServiceError,
  nextStatus,
  orderNumber,
  orderTotal,
  roundMoney,
  statusLabel,
  type Order,
  type VendorOrderContext,
} from '@repo/core';
import { ProductImage } from '@/components/product-image';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FormError } from '@/components/ui/form-error';
import { OrderThread } from '@/features/orders/order-thread';
import { StatusBadge } from '@/features/orders/status-badge';
import { StatusTracker } from '@/features/orders/status-tracker';
import { useSignedIn } from '@/lib/session';
import { useUpdateOrderStatus, useVendorOrder, useVendorOrderContext } from './queries';
import { useMsg, useT } from '@/lib/i18n';

/** 03 → vendor "Order detail" on mobile: status changer from the vendor's config, buyer info, messages. */
export function VendorOrderDetailScreen({ vendorOrgId, orderId }: { vendorOrgId: string; orderId: string }) {
  const t = useT('vendorOrders');
  const to = useT('orders');
  const tmo = useT('m.orders');
  const order = useVendorOrder(orderId);
  const ctx = useVendorOrderContext(vendorOrgId);
  const notFound = <EmptyState title={to('notFoundTitle')} description={t('notFoundDescription')} />;
  if (order.isError) return isServiceError(order.error, 'NOT_FOUND') ? notFound : <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  if (ctx.isError) return <ErrorState error={ctx.error} onRetry={() => void ctx.refetch()} />;
  if (!order.data || !ctx.data) return <LoadingState label={tmo('loadingOne')} />;
  if (order.data.vendorOrgId !== vendorOrgId) return notFound;
  return <Detail order={order.data} ctx={ctx.data} vendorOrgId={vendorOrgId} />;
}

function Detail({ order, ctx, vendorOrgId }: { order: Order; ctx: VendorOrderContext; vendorOrgId: string }) {
  const t = useT('vendorOrders');
  const to = useT('orders');
  const tmo = useT('m.orders');
  const tm = useMsg();
  const { membership } = useSignedIn();
  const update = useUpdateOrderStatus(vendorOrgId, order.id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notice, setNotice] = useState<{ number: string; status: string }>();
  const next = nextStatus(ctx.config, order.statusKey);
  const cancelled = cancelledStatus(ctx.config);
  const current = ctx.config.statuses.find((s) => s.key === order.statusKey);
  const buyer = ctx.buyers.get(order.buyerOrgId);
  const buyerName = buyer?.name ?? t('buyer');
  const location = ctx.buyerLocations.get(order.locationId);
  const warehouse = order.fulfillingLocationId ? ctx.vendorLocations.get(order.fulfillingLocationId) : undefined;
  const placedBy = ctx.buyerUsers.get(order.createdByUserId)?.name;

  const setStatus = (statusKey: string) => {
    const label = tm(statusLabel(ctx.config.statuses.find((s) => s.key === statusKey), statusKey));
    setConfirmCancel(false);
    update.mutate(statusKey, { onSuccess: () => setNotice({ number: orderNumber(order), status: label }) });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background">
      <Stack.Screen options={{ title: tmo('orderAria', { number: orderNumber(order) }) }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12" keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <AppText mono weight="semibold" className="text-xl text-foreground">
              {orderNumber(order)}
            </AppText>
            <StatusBadge config={ctx.config} statusKey={order.statusKey} />
          </View>
          <AppText className="text-sm text-muted-foreground">
            {placedBy
              ? to('placedAtBy', { vendor: buyerName, when: formatDateTime(order.createdAt), name: placedBy })
              : to('placedAt', { vendor: buyerName, when: formatDateTime(order.createdAt) })}
          </AppText>
        </View>

        <StatusTracker config={ctx.config} statusKey={order.statusKey} />

        <Card>
          <CardHeader title={to('status')} description={t('statusDescription')} />
          {notice && (
            <AppText accessibilityRole="alert" className="text-sm text-success">
              {t('statusChanged', notice)}
            </AppText>
          )}
          {next && (
            <Button loading={update.isPending} onPress={() => setStatus(next.key)}>
              {t('markAs', { status: tm(statusLabel(next)) })}
            </Button>
          )}
          <View className="gap-2">
            <AppText weight="medium" className="text-sm text-foreground">
              {t('setAny')}
            </AppText>
            <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
              {ctx.config.statuses.map((s) => (
                <Chip
                  key={s.key}
                  role="radio"
                  label={tm(statusLabel(s))}
                  selected={s.key === order.statusKey}
                  onPress={() => (s.key === order.statusKey ? undefined : s.isCancelled ? setConfirmCancel(true) : setStatus(s.key))}
                />
              ))}
            </View>
          </View>
          {cancelled && !current?.isCancelled && !confirmCancel && (
            <Button variant="destructive" onPress={() => setConfirmCancel(true)}>
              {t('cancelOrder')}
            </Button>
          )}
          {confirmCancel && cancelled && (
            <View accessibilityRole="alert" className="gap-2 rounded-lg border border-border p-3">
              <AppText className="text-sm text-foreground">{tmo('cancelConfirm', { buyer: buyerName, status: tm(statusLabel(cancelled)) })}</AppText>
              <View className="flex-row gap-2">
                <Button size="sm" variant="outline" onPress={() => setConfirmCancel(false)}>
                  {t('keepOrder')}
                </Button>
                <Button size="sm" variant="destructive" loading={update.isPending} onPress={() => setStatus(cancelled.key)}>
                  {t('cancelOrder')}
                </Button>
              </View>
            </View>
          )}
          {update.error ? <FormError error={update.error} /> : null}
        </Card>

        <Card>
          <CardHeader title={t('items')} description={to('pricesAsCharged')} />
          {order.items.map((i) => {
            const p = ctx.products.get(i.productId);
            return (
              <View key={i.id} className="flex-row items-center justify-between gap-3">
                <ProductImage src={p?.imageUrl} className="size-10" />
                <View className="flex-1">
                  <AppText className="text-sm text-foreground" numberOfLines={2}>
                    {`${formatNumber(i.quantity)} × ${p?.name ?? t('deletedProduct')}`}
                  </AppText>
                  <AppText mono className="text-xs text-muted-foreground">{tmo('each', { price: formatMoney(i.priceAtOrder) })}</AppText>
                </View>
                <AppText mono className="text-sm text-foreground">
                  {formatMoney(roundMoney(i.quantity * i.priceAtOrder))}
                </AppText>
              </View>
            );
          })}
          <View className="h-px bg-border" />
          <View className="flex-row justify-between">
            <AppText weight="semibold" className="text-base text-foreground">
              {t('total')}
            </AppText>
            <AppText mono weight="semibold" className="text-base text-foreground">
              {formatMoney(orderTotal(order))}
            </AppText>
          </View>
        </Card>

        <Card>
          <CardHeader title={tmo('buyerDelivery')} />
          {buyer ? (
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/vendor/buyer/[id]', params: { id: buyer.id } })}>
              <AppText weight="medium" className="text-sm text-primary">
                {buyer.name}
              </AppText>
            </Pressable>
          ) : (
            <AppText className="text-sm text-foreground">{t('formerBuyer')}</AppText>
          )}
          <AppText className="text-sm text-foreground">{location?.name ?? '—'}</AppText>
          {location?.address ? <AppText className="text-sm text-muted-foreground">{location.address}</AppText> : null}
          {warehouse && <AppText className="text-sm text-muted-foreground">{tmo('fulfillingFrom', { name: warehouse.name })}</AppText>}
        </Card>

        <OrderThread
          orderId={order.id}
          side="vendor"
          myUserId={membership.user.id}
          counterpartName={buyerName}
          senderName={(m) =>
            m.senderOrgType === 'vendor'
              ? ctx.vendorUsers.get(m.senderUserId)?.name ?? t('yourTeam')
              : `${ctx.buyerUsers.get(m.senderUserId)?.name ?? t('buyer')} · ${buyerName}`
          }
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
