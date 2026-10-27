import { useDeferredValue, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { formatDate, formatMoney, formatNumber, formatPercent, isApiError, type Offer } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useCart } from '@/lib/cart';
import { useT } from '@/lib/i18n';
import { FavoriteButton, Notice, OfferBadges, OfferImage, PriceBlock, QuantityStepper, useAddToCart } from './components';
import { useOffer } from './queries';
import { useVendorContext } from './vendor-context';

/** Buyer product detail on mobile: price at the chosen quantity, how it is set, tiers, promotions, add to cart. */
export function ProductDetailScreen({ productId }: { productId: string }) {
  const t = useT('product');
  const tm = useT('mCommon');
  const vendor = useVendorContext();
  const vendorId = vendor.active?.vendorId ?? null;
  const base = useOffer(vendorId, productId);
  const notFound = <EmptyState title={t('unavailableTitle')} description={t('unavailableDescription')} />;

  if (vendor.isPending || (vendorId && base.isPending)) return <LoadingState label={tm('loadingProduct')} />;
  if (vendor.error) return <ErrorState error={vendor.error} onRetry={() => void vendor.refetch()} />;
  if (!vendorId) return notFound;
  if (base.isError) return isApiError(base.error) && base.error.status === 404 ? notFound : <ErrorState error={base.error} onRetry={() => void base.refetch()} />;
  if (!base.data) return notFound;
  return <Detail key={productId} offer={base.data} />;
}

function Detail({ offer }: { offer: Offer }) {
  const t = useT('product');
  const tmo = useT('mProduct');
  const { product } = offer;
  const min = product.minimumQuantity;
  const [quantity, setQuantity] = useState(min);
  const deferred = useDeferredValue(quantity);
  const priced = useOffer(offer.vendorId, product.id, deferred === min ? undefined : deferred);
  const current = priced.data ?? offer;
  const price = current.effectivePrice;
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' }>();
  const [image, setImage] = useState(0);
  const cart = useCart();
  const add = useAddToCart();
  const inCart = cart.quantityOf(product.id);
  const money = (amount: string) => formatMoney(amount, offer.currency);
  const gallery = product.galleryAssetIds;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-12" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: product.name, headerRight: () => <FavoriteButton offer={offer} onError={(text) => setNotice({ text, tone: 'error' })} /> }} />
      <OfferImage assetId={gallery[image]} className="w-full rounded-xl" style={{ aspectRatio: 4 / 3 }} accessibilityLabel={t('imageOf', { name: product.name })} />
      {gallery.length > 1 && (
        <View className="flex-row gap-2" accessibilityLabel={t('gallery')}>
          {gallery.map((id, i) => (
            <Pressable key={id} accessibilityRole="button" aria-selected={i === image} accessibilityLabel={t('showImage', { n: formatNumber(i + 1) })} onPress={() => setImage(i)}>
              <OfferImage assetId={id} className={`size-14 ${i === image ? 'border-2 border-primary' : ''}`} />
            </Pressable>
          ))}
        </View>
      )}
      <View className="gap-1">
        <AppText weight="semibold" className="text-xl text-foreground">
          {product.name}
        </AppText>
        <AppText className="text-xs text-muted-foreground">
          {[product.sku, offer.category?.name, product.packDescription].filter(Boolean).join(' · ')}
        </AppText>
        {product.description ? <AppText className="text-sm text-foreground">{product.description}</AppText> : null}
        {offer.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1 pt-1">
            {offer.tags.map((tag) => (
              <Badge key={tag.id}>{tag.name}</Badge>
            ))}
          </View>
        )}
      </View>

      <Card>
        <View className={priced.isFetching ? 'opacity-60' : undefined} accessibilityLiveRegion="polite">
          <PriceBlock price={price} currency={offer.currency} unit={offer.unitName} size="lg" />
        </View>
        <OfferBadges offer={current} />
        <AppText className="text-sm text-muted-foreground">
          {product.quantityStep > 1
            ? t('quantityRule', { min: formatNumber(min), step: formatNumber(product.quantityStep), unit: offer.unitName })
            : t('minimumOrder', { qty: formatNumber(min), unit: offer.unitName })}
        </AppText>
        <View className="flex-row items-center justify-between gap-3">
          <QuantityStepper value={quantity} rule={product} onChange={setQuantity} label={t('quantityOf', { product: product.name })} />
          <View className="items-end">
            <AppText className="text-xs text-muted-foreground">{t('total')}</AppText>
            <AppText mono weight="semibold" className="text-base text-foreground" accessibilityLiveRegion="polite">
              {money(price.lineTotal)}
            </AppText>
          </View>
        </View>
        {priced.isError && <Notice text={t('repriceFailed')} tone="error" />}
        <Button
          onPress={() => {
            add(offer, quantity);
            setNotice({ text: t('added', { qty: formatNumber(quantity), product: product.name }), tone: 'success' });
          }}>
          {t('addToCart')}
        </Button>
        {notice && <Notice text={notice.text} tone={notice.tone} />}
        {inCart > 0 && (
          <Button variant="ghost" size="sm" onPress={() => router.navigate('/buyer/cart')}>
            {tmo('inCartView', { qty: formatNumber(inCart) })}
          </Button>
        )}
        <AppText className="text-xs text-muted-foreground">{t('estimateNote')}</AppText>
      </Card>

      <Card>
        <CardHeader title={t('breakdownTitle')} description={t('breakdownDescription', { unit: offer.unitName })} />
        <Row label={t('baseLabel')} value={money(price.baseUnitPrice)} />
        {price.reachedTierThreshold !== null && <Row label={t('tierLabel', { qty: formatNumber(price.reachedTierThreshold) })} value={money(price.normalUnitPrice)} />}
        {price.agreedUnitPrice !== null && <Row label={t('agreedLabel')} value={money(price.agreedUnitPrice)} />}
        {price.appliedPromotion && <Row label={t('promotionLabel', { name: price.appliedPromotion.name })} value={money(price.finalUnitPrice)} />}
        <Row label={t('finalLabel')} value={money(price.finalUnitPrice)} strong />
        <Row label={t('lineTotalAt', { qty: formatNumber(current.pricedQuantity), unit: offer.unitName })} value={money(price.lineTotal)} strong />
      </Card>

      {offer.tiers.length > 0 && (
        <Card>
          <CardHeader title={t('tiersTitle')} description={offer.agreedPrice !== null ? t('agreedOverridesTiers') : t('tiersDescription', { unit: offer.unitName })} />
          <View className="overflow-hidden rounded-lg border border-border">
            {min < offer.tiers[0]!.minimumQuantity && (
              <TierRow label={`${formatNumber(min)}–${formatNumber(offer.tiers[0]!.minimumQuantity - 1)}`} price={money(offer.basePrice)} active={price.reachedTierThreshold === null} />
            )}
            {offer.tiers.map((tier, i) => {
              const next = offer.tiers[i + 1];
              return (
                <View key={tier.minimumQuantity}>
                  {(i > 0 || min < offer.tiers[0]!.minimumQuantity) && <View className="h-px bg-border" />}
                  <TierRow
                    label={next ? `${formatNumber(tier.minimumQuantity)}–${formatNumber(next.minimumQuantity - 1)}` : `${formatNumber(tier.minimumQuantity)}+`}
                    price={money(tier.unitPrice)}
                    active={price.reachedTierThreshold === tier.minimumQuantity}
                  />
                </View>
              );
            })}
          </View>
        </Card>
      )}

      {current.promotions.length > 0 && (
        <Card>
          <CardHeader title={t('promotionsTitle')} description={t('promotionsDescription', { qty: formatNumber(current.pricedQuantity) })} />
          {current.promotions.map((p) => (
            <View key={p.id} className="gap-1">
              <AppText weight="medium" className="text-sm text-foreground">
                {p.name}
              </AppText>
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge variant="success">
                  {p.kind === 'PERCENTAGE' ? t('promotionPercent', { value: formatPercent(p.value) }) : t('promotionFixed', { price: money(p.value), unit: offer.unitName })}
                </Badge>
                <AppText className="text-xs text-muted-foreground">{t('promotionUntil', { date: formatDate(p.endsAt) })}</AppText>
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between gap-3">
      <AppText weight={strong ? 'medium' : 'regular'} className={`flex-1 text-sm ${strong ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </AppText>
      <AppText mono weight={strong ? 'semibold' : 'regular'} className="text-sm text-foreground">
        {value}
      </AppText>
    </View>
  );
}

function TierRow({ label, price, active }: { label: string; price: string; active: boolean }) {
  return (
    <View className={`flex-row justify-between px-3 py-2.5 ${active ? 'bg-muted' : ''}`} aria-current={active ? 'true' : undefined}>
      <AppText className="text-sm text-foreground">{label}</AppText>
      <AppText mono className="text-sm text-foreground">
        {price}
      </AppText>
    </View>
  );
}
