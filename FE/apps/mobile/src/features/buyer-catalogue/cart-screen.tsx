import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { cartEstimate, checkCartLine, EMPTY_CART, formatMoney, formatNumber, snapshotFromOffer, type CartLineSnapshot, type Currency } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cartStore, useCart } from '@/lib/cart';
import { useErrorText, useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { isDraftConflict, useSaveCartAsDraft } from './cart-actions';
import { Notice, OfferImage, PriceBlock, QuantityStepper } from './components';
import { DraftConflictPanel } from './draft-conflict';
import { useCartLineOffers } from './queries';
import { useVendorContext } from './vendor-context';

/** The active vendor's local cart on mobile — same rules as web. */
export function CartScreen() {
  const c = useTokenColors();
  const t = useT('cart');
  const tmo = useT('mCart');
  const errorText = useErrorText();
  const { organization } = useBusiness();
  const vendor = useVendorContext();
  const cart = useCart();
  const rows = useCartLineOffers(cart.scope?.vendorId, cart.lines);
  const save = useSaveCartAsDraft(cart.scope);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' }>();
  const [conflict, setConflict] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const currency: Currency = rows.find((r) => r.offer)?.offer?.currency ?? organization.currency;

  const fresh = rows.flatMap((r) => (r.offer ? [[r.line.productId, snapshotFromOffer(r.offer)] as const] : []));
  const freshKey = JSON.stringify(fresh);
  useEffect(() => {
    if (!cart.scope || fresh.length === 0) return;
    cartStore.updateSnapshots(cart.scope, Object.fromEntries(fresh) as Record<string, CartLineSnapshot>);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freshKey captures `fresh`
  }, [cart.scope, freshKey]);

  if (vendor.isPending) return <LoadingState label={tmo('pricing')} />;
  if (vendor.error) return <ErrorState error={vendor.error} onRetry={() => void vendor.refetch()} />;

  const checks = rows.map((r) => checkCartLine(r.line, r.offer, r.unavailable));
  const estimate = cartEstimate(rows);
  const blocking = checks.some((ch) => ch.unavailable || ch.issue !== null) || rows.some((r) => r.isPending || !!r.error);
  const linked = cart.state.draft;
  const doSave = (asNew: boolean) =>
    save.mutate(
      { asNew },
      {
        onSuccess: () => setNotice({ text: linked && !asNew ? t('draftUpdated') : t('draftSaved'), tone: 'success' }),
        onError: (e) => (isDraftConflict(e) ? setConflict(true) : setNotice({ text: errorText(e), tone: 'error' })),
      },
    );

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 pb-10" keyboardShouldPersistTaps="handled">
      <View className="gap-2 px-4 pt-3">
        {notice && <Notice text={notice.text} tone={notice.tone} />}
        {cart.state.pendingSubmission && (
          <View className="gap-2 rounded-lg border border-border bg-card p-3">
            <AppText weight="medium" className="text-sm text-foreground">{t('pendingTitle')}</AppText>
            <AppText className="text-sm text-muted-foreground">{t('pendingDescription')}</AppText>
            <Button size="sm" onPress={() => router.push('/buyer/checkout')}>{t('pendingCheck')}</Button>
          </View>
        )}
        {linked && (
          <View className="gap-2 rounded-lg border border-border bg-card p-3">
            <AppText weight="medium" className="text-sm text-foreground">{t('linkedTitle')}</AppText>
            <AppText className="text-sm text-muted-foreground">{t('linkedDescription')}</AppText>
            <Button size="sm" variant="ghost" onPress={() => cart.linkDraft(null)}>{t('unlink')}</Button>
          </View>
        )}
        {conflict && <DraftConflictPanel scope={cart.scope} onDone={(text) => { setConflict(false); if (text) setNotice({ text, tone: 'success' }); }} />}
        <Button variant="outline" size="sm" onPress={() => router.push('/buyer/drafts' as Href)}>{t('savedDrafts')}</Button>
      </View>

      {!vendor.active ? (
        <EmptyState title={t('noVendorTitle')} description={t('noVendorDescription')} />
      ) : cart.lines.length === 0 ? (
        <View className="gap-3">
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
          <View className="items-center">
            <Button variant="outline" onPress={() => router.navigate('/buyer')}>{t('browse')}</Button>
          </View>
        </View>
      ) : (
        <View className="gap-4">
          <View>
            {rows.map(({ line, offer, error }, i) => {
              const check = checks[i]!;
              const snap = line.snapshot;
              const name = offer?.product.name ?? snap?.name ?? t('unknownProduct');
              const pricedHere = offer && offer.pricedQuantity === line.quantity;
              return (
                <View key={line.productId}>
                  {i > 0 && <View className="mx-4 h-px bg-border" />}
                  <View className={`gap-2 px-4 py-3 ${check.unavailable ? 'opacity-60' : ''}`}>
                    <View className="flex-row items-start gap-3">
                      <OfferImage assetId={offer?.product.galleryAssetIds[0] ?? snap?.imageAssetId} className="size-12" />
                      <View className="flex-1 gap-1">
                        <AppText weight="medium" className="text-base text-foreground" numberOfLines={2}>{name}</AppText>
                        {offer && pricedHere && <PriceBlock price={offer.effectivePrice} currency={offer.currency} unit={offer.unitName} />}
                        <View className="flex-row flex-wrap gap-1">
                          {check.unavailable && <Badge variant="destructive">{t('noLongerAvailable')}</Badge>}
                          {check.issue && check.rule && (
                            <Badge variant="warning">{t('quantityInvalid', { min: formatNumber(check.rule.minimumQuantity), step: formatNumber(check.rule.quantityStep) })}</Badge>
                          )}
                          {check.stockShort && offer && <Badge variant="warning">{t('stockShort', { qty: formatNumber(offer.availableQuantity ?? 0) })}</Badge>}
                          {!!error && <Badge>{t('priceUnavailable')}</Badge>}
                        </View>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('removeAria', { product: name })} hitSlop={8} onPress={() => cart.remove(line.productId)}>
                        <Trash2 size={18} color={c['muted-foreground']} />
                      </Pressable>
                    </View>
                    {!check.unavailable && check.rule && (
                      <View className="flex-row items-center justify-between gap-2">
                        <QuantityStepper value={line.quantity} rule={check.rule} onChange={(q) => cart.setQuantity(line.productId, q)} label={t('quantityOf', { product: name })} />
                        <AppText mono weight="semibold" className="text-base text-foreground">
                          {offer && pricedHere ? formatMoney(offer.effectivePrice.lineTotal, offer.currency) : '—'}
                        </AppText>
                      </View>
                    )}
                    {check.suggested !== null && (
                      <Button size="sm" variant="outline" onPress={() => cart.setQuantity(line.productId, check.suggested!)}>
                        {t('useQuantity', { qty: formatNumber(check.suggested) })}
                      </Button>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View className="mx-4 gap-3 rounded-xl border border-border bg-card p-4">
            <View className="flex-row justify-between">
              <AppText className="text-sm text-muted-foreground">{t('products')}</AppText>
              <AppText mono className="text-sm text-foreground">{formatNumber(cart.lines.length)}</AppText>
            </View>
            <View className="flex-row justify-between">
              <AppText weight="semibold" className="text-base text-foreground">{estimate.complete ? t('estimatedTotal') : t('partialTotal')}</AppText>
              <AppText mono weight="semibold" className="text-base text-foreground">{formatMoney(estimate.total, currency)}</AppText>
            </View>
            <AppText className="text-xs text-muted-foreground">{t('pricingNote')}</AppText>
            <Button disabled={blocking} onPress={() => router.push('/buyer/checkout')}>{t('checkout')}</Button>
            {blocking && <AppText className="text-xs text-muted-foreground">{t('fixBeforeCheckout')}</AppText>}
            <Button variant="outline" loading={save.isPending} onPress={() => doSave(false)}>{linked ? t('updateDraft') : t('saveAsDraft')}</Button>
            {linked && <Button variant="ghost" size="sm" disabled={save.isPending} onPress={() => doSave(true)}>{t('saveAsNewDraft')}</Button>}
            {confirmClear ? (
              <View accessibilityRole="alert" className="gap-2">
                <AppText className="text-sm text-foreground">{linked ? t('clearLinkedDescription') : t('clearDescription')}</AppText>
                <View className="flex-row gap-2">
                  <Button size="sm" variant="outline" onPress={() => setConfirmClear(false)}>{t('cancel')}</Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onPress={() => {
                      cart.replace({ ...EMPTY_CART, deliveryLocationId: cart.state.deliveryLocationId, pendingSubmission: cart.state.pendingSubmission });
                      setConfirmClear(false);
                    }}>
                    {t('clear')}
                  </Button>
                </View>
              </View>
            ) : (
              <Button variant="ghost" size="sm" onPress={() => setConfirmClear(true)}>{t('clear')}</Button>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
