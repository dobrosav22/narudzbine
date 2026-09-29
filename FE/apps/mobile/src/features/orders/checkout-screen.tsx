import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { checkoutProblems, defaultLocationId, formatMoney, formatNumber } from '@repo/core';
import { ProductImage } from '@/components/product-image';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { OptionRow } from '@/features/account/account-screen';
import { useCartPricing } from '@/features/buyer-catalogue/queries';
import { useCart } from '@/lib/cart';
import { useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useBuyerLocations, usePlaceOrder } from './queries';
import { useMsg, useT } from '@/lib/i18n';

/** 03 → buyer "Checkout" on mobile: delivery location, review, confirm. No payment step (01 §5). */
export function CheckoutScreen() {
  const c = useTokenColors();
  const t = useT('checkout');
  const tc = useT('cart');
  const tmo = useT('m.checkout');
  const tm = useMsg();
  const { membership, activeVendor } = useSignedIn();
  const cart = useCart();
  const pricing = useCartPricing(cart.scope, cart.lines);
  const locations = useBuyerLocations(membership.org.id);
  const place = usePlaceOrder(cart.scope, membership.user.id);
  const locationId = cart.state.locationId ?? defaultLocationId(locations.data ?? [], membership.user.homeLocationId);

  if (cart.lines.length === 0 && !place.isSuccess) return <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />;
  if (pricing.isError || locations.isError) {
    return <ErrorState error={pricing.error ?? locations.error} onRetry={() => void Promise.all([pricing.refetch(), locations.refetch()])} />;
  }
  if (!pricing.data || !locations.data) return <LoadingState label={tmo('preparing')} />;

  const problems = checkoutProblems({ rows: pricing.data.rows, locationId, locations: locations.data });

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-12">
      {problems.length > 0 && (
        <View className="gap-1 rounded-lg border border-border bg-card p-3">
          <AppText weight="medium" className="text-sm text-foreground">
            {t('fixFirst')}
          </AppText>
          {problems.map((p) => (
            <AppText key={p.key + JSON.stringify(p.values ?? {})} className="text-sm text-muted-foreground">{`• ${tm(p)}`}</AppText>
          ))}
        </View>
      )}
      {place.error ? <FormError error={place.error} /> : null}

      <Card>
        <CardHeader title={t('deliveryLocation')} />
        <View className="overflow-hidden rounded-lg border border-border" accessibilityRole="radiogroup">
          {locations.data.map((l, i) => (
            <View key={l.id}>
              {i > 0 && <View className="h-px bg-border" />}
              <OptionRow
                icon={<MapPin size={18} color={c['muted-foreground']} />}
                title={`${l.name}${l.id === membership.user.homeLocationId ? ` · ${t('yourLocation')}` : ''}`}
                subtitle={l.address || t('noAddress')}
                selected={l.id === locationId}
                onPress={() => cart.setLocation(l.id)}
              />
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <CardHeader title={tc('items')} description={t('finalPrices')} />
        {pricing.data.rows
          .filter((r) => r.product && r.price)
          .map(({ line, product, price }) => (
            <View key={line.productId} className="flex-row items-center justify-between gap-3">
              <ProductImage src={product!.imageUrl} className="size-10" />
              <AppText className="flex-1 text-sm text-foreground" numberOfLines={2}>
                {`${formatNumber(line.quantity)} × ${product!.name}`}
              </AppText>
              <AppText mono className="text-sm text-foreground">
                {formatMoney(price!.lineTotal)}
              </AppText>
            </View>
          ))}
        <View className="h-px bg-border" />
        <View className="flex-row justify-between">
          <AppText weight="semibold" className="text-base text-foreground">
            {tc('total')}
          </AppText>
          <AppText mono weight="semibold" className="text-base text-foreground">
            {formatMoney(pricing.data.total)}
          </AppText>
        </View>
        <AppText className="text-xs text-muted-foreground">{t('noPayment', { vendor: activeVendor?.name ?? tmo('theVendor') })}</AppText>
      </Card>

      <Button
        loading={place.isPending}
        disabled={problems.length > 0 || !locationId}
        onPress={() =>
          place.mutate(locationId!, {
            onSuccess: (order) => router.replace({ pathname: '/buyer/order/[id]', params: { id: order.id, placed: '1' } }),
          })
        }>
        {t('placeOrder')}
      </Button>
    </ScrollView>
  );
}
