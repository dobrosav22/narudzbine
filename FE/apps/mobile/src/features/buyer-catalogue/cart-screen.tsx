import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import {
  checkoutProblems,
  defaultLocationId,
  defaultQuantity,
  formatDateTime,
  formatMoney,
  formatNumber,
  priceNote,
  type DraftCart,
} from '@repo/core';
import { ProductImage } from '@/components/product-image';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FormError } from '@/components/ui/form-error';
import { useCart } from '@/lib/cart';
import { useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';
import {
  useBuyerLocations,
  useBuyerUsers,
  useDiscardDraft,
  useDraftCarts,
  useParkCart,
  useResumeDraft,
} from '@/features/orders/queries';
import { QuantityStepper } from './components';
import { useCartPricing } from './queries';
import { useMsg, useT } from '@/lib/i18n';

/** 03 → buyer "Cart" + "Draft carts" on mobile — same rules as web. */
export function CartScreen() {
  const c = useTokenColors();
  const t = useT('cart');
  const tmo = useT('m.cart');
  const tm = useMsg();
  const { membership } = useSignedIn();
  const cart = useCart();
  const pricing = useCartPricing(cart.scope, cart.lines);
  const locations = useBuyerLocations(membership.org.id);
  const park = useParkCart(cart.scope, membership.user.id);
  const resume = useResumeDraft(cart.scope);
  const [pendingResume, setPendingResume] = useState<DraftCart>();
  const [notice, setNotice] = useState<'savedLoaded' | 'saved'>();

  const locationId = cart.state.locationId ?? defaultLocationId(locations.data ?? [], membership.user.homeLocationId);
  const problems = pricing.data && locations.data ? checkoutProblems({ rows: pricing.data.rows, locationId, locations: locations.data }) : [];
  const doResume = (d: DraftCart) => {
    resume(d);
    setPendingResume(undefined);
    setNotice('savedLoaded');
  };

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 pb-10" keyboardShouldPersistTaps="handled">
      {notice && (
        <AppText accessibilityRole="alert" className="px-4 pt-3 text-sm text-success">
          {t(notice)}
        </AppText>
      )}
      {cart.lines.length === 0 ? (
        <View className="gap-3">
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
          <View className="items-center">
            <Button variant="outline" onPress={() => router.navigate('/buyer')}>
              {t('browse')}
            </Button>
          </View>
        </View>
      ) : pricing.isError ? (
        <ErrorState error={pricing.error} onRetry={() => void pricing.refetch()} />
      ) : !pricing.data ? (
        <LoadingState label={tmo('pricing')} />
      ) : (
        <View className="gap-4">
          {cart.state.draftCartId && (
            <AppText className="px-4 pt-3 text-sm text-muted-foreground">{t('editingSaved')}</AppText>
          )}
          <View>
            {pricing.data.rows.map(({ line, product, price, belowMinimum }, i) => {
              const note = price && priceNote(price);
              return (
                <View key={line.productId}>
                  {i > 0 && <View className="mx-4 h-px bg-border" />}
                  <View className={`gap-2 px-4 py-3 ${product ? '' : 'opacity-60'}`}>
                    <View className="flex-row items-start gap-3">
                      <ProductImage src={product?.imageUrl} className="size-12" />
                      <View className="flex-1 gap-0.5">
                        <AppText weight="medium" className="text-base text-foreground" numberOfLines={2}>
                          {product?.name ?? t('noLongerAvailable')}
                        </AppText>
                        {product && price && (
                          <AppText mono className="text-xs text-muted-foreground">{`${formatMoney(price.unitPrice)} / ${product.unit}`}</AppText>
                        )}
                        <View className="flex-row flex-wrap gap-1">
                          {note && <Badge variant={note.variant}>{tm(note.msg)}</Badge>}
                          {product && belowMinimum && <Badge variant="warning">{t('minimumOrder', { qty: formatNumber(defaultQuantity(product)) })}</Badge>}
                        </View>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('removeAria', { product: product?.name ?? t('unavailableProduct') })}
                        hitSlop={8}
                        onPress={() => cart.remove(line.productId)}>
                        <Trash2 size={18} color={c['muted-foreground']} />
                      </Pressable>
                    </View>
                    {product && (
                      <View className="flex-row items-center justify-between">
                        <QuantityStepper
                          value={line.quantity}
                          min={defaultQuantity(product)}
                          onChange={(q) => cart.setQuantity(product.id, q)}
                          label={t('quantityOf', { product: product.name })}
                        />
                        <AppText mono weight="semibold" className="text-base text-foreground">
                          {price ? formatMoney(price.lineTotal) : '—'}
                        </AppText>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View className="mx-4 gap-3 rounded-xl border border-border bg-card p-4">
            <AppText weight="medium" className="text-sm text-foreground">
              {t('deliverTo')}
            </AppText>
            {locations.isError ? (
              <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
            ) : (
              <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
                {locations.data?.map((l) => (
                  <Chip key={l.id} role="radio" label={l.name} selected={l.id === locationId} onPress={() => cart.setLocation(l.id)} />
                ))}
              </View>
            )}
            {locationId && <AppText className="text-sm text-muted-foreground">{locations.data?.find((l) => l.id === locationId)?.address}</AppText>}
            <View className="h-px bg-border" />
            <View className="flex-row justify-between">
              <AppText className="text-sm text-muted-foreground">{t('items')}</AppText>
              <AppText mono className="text-sm text-foreground">
                {formatNumber(pricing.data.itemCount)}
              </AppText>
            </View>
            <View className="flex-row justify-between">
              <AppText weight="semibold" className="text-base text-foreground">
                {t('total')}
              </AppText>
              <AppText mono weight="semibold" className="text-base text-foreground">
                {formatMoney(pricing.data.total)}
              </AppText>
            </View>
            <Button
              disabled={problems.length > 0}
              onPress={() => {
                if (locationId && !cart.state.locationId) cart.setLocation(locationId);
                router.push('/buyer/checkout');
              }}>
              {t('checkout')}
            </Button>
            {problems.map((p) => (
              <AppText key={p.key + JSON.stringify(p.values ?? {})} className="text-xs text-muted-foreground">{`• ${tm(p)}`}</AppText>
            ))}
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                loading={park.isPending}
                onPress={() => park.mutate(undefined, { onSuccess: () => setNotice('saved') })}>
                {t('saveForLater')}
              </Button>
              <Button variant="ghost" size="sm" onPress={() => cart.clear()}>
                {t('clear')}
              </Button>
            </View>
            {park.error ? <FormError error={park.error} /> : null}
          </View>
        </View>
      )}

      {pendingResume && (
        <View accessibilityRole="alert" className="mx-4 gap-2 rounded-lg border border-border bg-card p-3">
          <AppText className="text-sm text-foreground">{tmo('replacePrompt')}</AppText>
          <View className="flex-row gap-2">
            <Button size="sm" variant="outline" onPress={() => setPendingResume(undefined)}>
              {t('cancel')}
            </Button>
            <Button size="sm" onPress={() => doResume(pendingResume)}>
              {t('replace')}
            </Button>
          </View>
        </View>
      )}

      <SavedCarts currentDraftId={cart.state.draftCartId} onResume={(d) => (cart.lines.length ? setPendingResume(d) : doResume(d))} />
    </ScrollView>
  );
}

/** Draft carts for this buyer org + vendor — visible to the whole team, mine first (01 §6). */
function SavedCarts({ currentDraftId, onResume }: { currentDraftId?: string; onResume: (d: DraftCart) => void }) {
  const c = useTokenColors();
  const t = useT('cart');
  const { membership } = useSignedIn();
  const cart = useCart();
  const drafts = useDraftCarts(cart.scope, membership.user.id);
  const users = useBuyerUsers(membership.org.id);
  const locations = useBuyerLocations(membership.org.id);
  const discard = useDiscardDraft(cart.scope);
  const name = (id: string) => (id === membership.user.id ? t('you') : users.data?.find((u) => u.id === id)?.name ?? t('teammate'));

  if (drafts.isError) return <ErrorState error={drafts.error} onRetry={() => void drafts.refetch()} />;
  const list = (drafts.data ?? []).filter((d) => d.id !== currentDraftId);
  if (drafts.isPending || list.length === 0) return null;

  return (
    <View className="mx-4 gap-2">
      <AppText weight="semibold" className="text-lg text-foreground">
        {t('savedTitle')}
      </AppText>
      <View className="overflow-hidden rounded-lg border border-border" accessibilityLabel={t('savedTitle')}>
        {list.map((d, i) => (
          <View key={d.id}>
            {i > 0 && <View className="h-px bg-border" />}
            <View className="flex-row items-center gap-3 p-3">
              <View className="flex-1 gap-0.5">
                <AppText weight="medium" className="text-sm text-foreground">
                  {t('savedLine', { who: name(d.createdByUserId), count: d.items.reduce((n, x) => n + x.quantity, 0), countText: formatNumber(d.items.reduce((n, x) => n + x.quantity, 0)) })}
                </AppText>
                <AppText className="text-xs text-muted-foreground">
                  {t('savedMeta', { location: locations.data?.find((l) => l.id === d.locationId)?.name ?? t('noLocation'), when: formatDateTime(d.updatedAt) })}
                </AppText>
              </View>
              <Button size="sm" variant="outline" onPress={() => onResume(d)}>
                {t('resume')}
              </Button>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('discardAria', { who: name(d.createdByUserId) })}
                hitSlop={8}
                onPress={() => discard.mutate(d)}>
                <Trash2 size={18} color={c['muted-foreground']} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
