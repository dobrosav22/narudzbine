import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { defaultQuantity, formatMoney, formatNumber, isServiceError, pickTier, type ProductDetail } from '@repo/core';
import { ProductImage } from '@/components/product-image';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useCart } from '@/lib/cart';
import { useSignedIn } from '@/lib/session';
import { FavoriteButton, PriceBlock, QuantityStepper } from './components';
import { useLinePrice, useProductDetail } from './queries';
import { useT } from '@/lib/i18n';

/** 03 → buyer "Product detail" on mobile. */
export function ProductDetailScreen({ productId }: { productId: string }) {
  const t = useT('product');
  const tm = useT('m.common');
  const { membership, activeVendor } = useSignedIn();
  const scope = { vendorOrgId: activeVendor?.id ?? '', buyerOrgId: membership.org.id };
  const detail = useProductDetail(scope, productId);
  const notFound = <EmptyState title={t('unavailableTitle')} description={t('unavailableDescription')} />;

  if (!activeVendor) return notFound;
  if (detail.isError) return isServiceError(detail.error, 'NOT_FOUND') ? notFound : <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (detail.isPending) return <LoadingState label={tm('loadingProduct')} />;
  if (!detail.data) return notFound;
  return <Detail key={productId} scope={scope} detail={detail.data} />;
}

function Detail({ scope, detail }: { scope: { vendorOrgId: string; buyerOrgId: string }; detail: ProductDetail }) {
  const t = useT('product');
  const tc = useT('catalogue');
  const tmo = useT('m.product');
  const { product, tiers, tierPrices } = detail;
  const min = defaultQuantity(product);
  const [quantity, setQuantity] = useState(min);
  const [added, setAdded] = useState<number>();
  const line = useLinePrice(scope, product.id, quantity);
  const price = line.data ?? detail.price;
  const cart = useCart();
  const inCart = cart.quantityOf(product.id);
  const activeTier = pickTier(tiers, quantity);
  const negotiated = detail.price.source === 'override';

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-12" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: product.name, headerRight: () => <FavoriteButton productId={product.id} productName={product.name} /> }} />
      <ProductImage
        src={product.imageUrl}
        className="w-full rounded-xl"
        style={{ aspectRatio: 4 / 3 }}
        accessibilityLabel={product.imageUrl ? tmo('imageOf', { name: product.name }) : undefined}
      />
      <View className="gap-1">
        <AppText weight="semibold" className="text-xl text-foreground">
          {product.name}
        </AppText>
        <AppText mono className="text-xs text-muted-foreground">
          {product.sku}
        </AppText>
        {product.description ? <AppText className="text-sm text-foreground">{product.description}</AppText> : null}
      </View>

      <Card>
        <PriceBlock price={price} unit={product.unit} size="lg" />
        <View className="flex-row flex-wrap gap-1">
          {min > 1 && <Badge>{t('minimumOrder', { qty: formatNumber(min) })}</Badge>}
          {product.stock === 0 && <Badge variant="destructive">{t('outOfStock')}</Badge>}
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <QuantityStepper value={quantity} min={min} onChange={setQuantity} label={t('quantityOf', { product: product.name })} />
          <View className="items-end">
            <AppText className="text-xs text-muted-foreground">{t('total')}</AppText>
            <AppText mono weight="semibold" className="text-base text-foreground" accessibilityLiveRegion="polite">
              {formatMoney(price.lineTotal)}
            </AppText>
          </View>
        </View>
        <Button
          onPress={() => {
            cart.add(product.id, quantity);
            setAdded(quantity);
          }}>
          {t('addToCart')}
        </Button>
        {added !== undefined && (
          <AppText accessibilityRole="alert" className="text-center text-sm text-success">
            {tc('added', { qty: formatNumber(added), product: product.name })}
          </AppText>
        )}
        {inCart > 0 && (
          <Button variant="ghost" size="sm" onPress={() => router.push('/buyer/cart')}>
            {tmo('inCartView', { qty: formatNumber(inCart) })}
          </Button>
        )}
      </Card>

      {negotiated ? (
        <Card>
          <CardHeader
            title={t('negotiatedTitle')}
            description={t('negotiatedDescription', { price: formatMoney(detail.price.preDiscountUnitPrice), unit: product.unit })}
          />
        </Card>
      ) : (
        tiers.length > 0 && (
          <Card>
            <CardHeader title={t('tiersTitle')} description={t('tiersDescription', { unit: product.unit })} />
            <View className="overflow-hidden rounded-lg border border-border">
              {min < tiers[0]!.minQty && (
                <TierRow label={`${formatNumber(min)}–${formatNumber(tiers[0]!.minQty - 1)}`} price={detail.price.unitPrice} active={!activeTier} />
              )}
              {tiers.map((tier, i) => {
                const next = tiers[i + 1];
                return (
                  <View key={tier.id}>
                    {(i > 0 || min < tiers[0]!.minQty) && <View className="h-px bg-border" />}
                    <TierRow
                      label={next ? `${formatNumber(tier.minQty)}–${formatNumber(next.minQty - 1)}` : `${formatNumber(tier.minQty)}+`}
                      price={tierPrices[i]!.unitPrice}
                      active={activeTier?.id === tier.id}
                    />
                  </View>
                );
              })}
            </View>
          </Card>
        )
      )}
    </ScrollView>
  );
}

function TierRow({ label, price, active }: { label: string; price: number; active: boolean }) {
  return (
    <View className={`flex-row justify-between px-3 py-2.5 ${active ? 'bg-muted' : ''}`} aria-current={active ? 'true' : undefined}>
      <AppText className="text-sm text-foreground">{label}</AppText>
      <AppText mono className="text-sm text-foreground">
        {formatMoney(price)}
      </AppText>
    </View>
  );
}
