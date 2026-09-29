import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  isServiceError,
  orderNumber,
  orderTotal,
  roundMoney,
  type Order,
} from '@repo/core';
import { ProductImage } from '@/components/product-image';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { cartStore } from '@/lib/cart';
import { sessionStore, useSignedIn } from '@/lib/session';
import { useBuyerLocations, useBuyerUsers, useOrder, useReorder, useStatusConfig, useVendorProductNames } from './queries';
import { OrderThread } from './order-thread';
import { StatusBadge } from './status-badge';
import { StatusTracker } from './status-tracker';
import { useT } from '@/lib/i18n';

/** 03 → buyer "Order detail" on mobile: tracker from the vendor's statuses, messages, reorder. */
export function OrderDetailScreen({ orderId, placed }: { orderId: string; placed: boolean }) {
  const t = useT('orders');
  const tmo = useT('m.orders');
  const { membership } = useSignedIn();
  const order = useOrder(orderId);
  const notFound = <EmptyState title={t('notFoundTitle')} description={t('notFoundDescription')} />;
  if (order.isError) return isServiceError(order.error, 'NOT_FOUND') ? notFound : <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  if (order.isPending) return <LoadingState label={tmo('loadingOne')} />;
  if (order.data.buyerOrgId !== membership.org.id) return notFound;
  return <Detail order={order.data} placed={placed} />;
}

function Detail({ order, placed }: { order: Order; placed: boolean }) {
  const t = useT('orders');
  const tc = useT('cart');
  const tmo = useT('m.orders');
  const { membership, connectedVendors, activeVendor } = useSignedIn();
  const config = useStatusConfig(order.vendorOrgId);
  const products = useVendorProductNames(order.vendorOrgId);
  const locations = useBuyerLocations(order.buyerOrgId);
  const users = useBuyerUsers(order.buyerOrgId);
  const reorder = useReorder();
  const [confirmReorder, setConfirmReorder] = useState(false);
  const vendorName = connectedVendors.find((v) => v.id === order.vendorOrgId)?.name ?? t('vendor');
  const location = locations.data?.find((l) => l.id === order.locationId);
  const placedBy = users.data?.find((u) => u.id === order.createdByUserId)?.name;

  const doReorder = () =>
    reorder.mutate(order, {
      onSuccess: async () => {
        if (activeVendor?.id !== order.vendorOrgId) await sessionStore.selectVendor(order.vendorOrgId);
        router.navigate('/buyer/cart');
      },
    });
  const startReorder = async () => {
    // Ask before replacing the cart of the ORDER's vendor, whichever vendor is active now.
    const target = { buyerOrgId: order.buyerOrgId, vendorOrgId: order.vendorOrgId };
    await cartStore.hydrate(target);
    if (cartStore.getLines(target).length) setConfirmReorder(true);
    else doReorder();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background">
      <Stack.Screen options={{ title: tmo('orderAria', { number: orderNumber(order) }) }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12" keyboardShouldPersistTaps="handled">
        {placed && (
          <View accessibilityRole="alert" className="gap-1 rounded-lg border border-border bg-card p-3">
            <AppText weight="medium" className="text-sm text-success">
              {t('placedTitle')}
            </AppText>
            <AppText className="text-sm text-muted-foreground">{tmo('placedDescription', { vendor: vendorName })}</AppText>
          </View>
        )}
        <View className="gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <AppText mono weight="semibold" className="text-xl text-foreground">
              {orderNumber(order)}
            </AppText>
            <StatusBadge config={config.data} statusKey={order.statusKey} />
          </View>
          <AppText className="text-sm text-muted-foreground">
            {placedBy
              ? t('placedAtBy', { vendor: vendorName, when: formatDateTime(order.createdAt), name: placedBy })
              : t('placedAt', { vendor: vendorName, when: formatDateTime(order.createdAt) })}
          </AppText>
        </View>

        {config.data && <StatusTracker config={config.data} statusKey={order.statusKey} />}

        <Card>
          <CardHeader title={tc('items')} description={t('pricesAsCharged')} />
          {order.items.map((i) => {
            const p = products.data?.get(i.productId);
            return (
              <View key={i.id} className="flex-row items-center justify-between gap-3">
                <ProductImage src={p?.imageUrl} className="size-10" />
                <View className="flex-1">
                  <AppText className="text-sm text-foreground" numberOfLines={2}>
                    {`${formatNumber(i.quantity)} × ${p?.name ?? (products.isPending ? '…' : t('productGone'))}`}
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
              {tc('total')}
            </AppText>
            <AppText mono weight="semibold" className="text-base text-foreground">
              {formatMoney(orderTotal(order))}
            </AppText>
          </View>
        </Card>

        <Card>
          <CardHeader title={t('delivery')} />
          <AppText weight="medium" className="text-sm text-foreground">
            {location?.name ?? '—'}
          </AppText>
          {location?.address ? <AppText className="text-sm text-muted-foreground">{location.address}</AppText> : null}
        </Card>

        {confirmReorder ? (
          <View accessibilityRole="alert" className="gap-2 rounded-lg border border-border bg-card p-3">
            <AppText className="text-sm text-foreground">
              {tmo('reorderReplace')}
            </AppText>
            <View className="flex-row gap-2">
              <Button size="sm" variant="outline" onPress={() => setConfirmReorder(false)}>
                {tc('cancel')}
              </Button>
              <Button size="sm" loading={reorder.isPending} onPress={doReorder}>
                {tc('replace')}
              </Button>
            </View>
          </View>
        ) : (
          <Button variant="outline" loading={reorder.isPending} onPress={() => void startReorder()}>
            {t('reorder')}
          </Button>
        )}
        {reorder.error ? <FormError error={reorder.error} /> : null}

        <OrderThread
          orderId={order.id}
          side="buyer"
          myUserId={membership.user.id}
          counterpartName={vendorName}
          // [assumed] Vendor-side senders show as the vendor org — buyers don't list vendor staff.
          senderName={(m) => (m.senderOrgType === 'vendor' ? vendorName : users.data?.find((u) => u.id === m.senderUserId)?.name ?? t('teammate'))}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
