import { useEffect, useState } from 'react';
import { Pressable, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Check, Heart, Minus, Package, Plus, ShoppingCart } from 'lucide-react-native';
import {
  apiConfig,
  assetContentUrl,
  formatMoney,
  formatNumber,
  isDiscounted,
  isValidQuantity,
  offerStockStatus,
  priceSource,
  snapQuantity,
  stepQuantity,
  type Currency,
  type Offer,
  type PriceResolution,
  type QuantityRule,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/lib/cart';
import { useErrorText, useT } from '@/lib/i18n';
import { useTokenColors } from '@/theme';
import { useFavorites, useToggleFavorite } from './queries';

/** The stored bearer for authenticated image requests (native transport; no cookies). */
function useBearer(): string | null | undefined {
  const [bearer, setBearer] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    Promise.resolve(apiConfig().getBearer?.() ?? null)
      .then((b) => live && setBearer(b ?? null))
      .catch(() => live && setBearer(null));
    return () => {
      live = false;
    };
  }, []);
  return bearer;
}

/** A READY media asset via expo-image with the bearer header, or a neutral placeholder. */
export function OfferImage({
  assetId,
  className,
  style,
  accessibilityLabel,
}: {
  assetId: string | null | undefined;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useTokenColors();
  const bearer = useBearer();
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = !!assetId && bearer !== undefined && failed !== assetId;
  return (
    <View
      className={`items-center justify-center overflow-hidden rounded-md bg-muted ${className ?? ''}`}
      style={style}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}>
      {showImage ? (
        <Image
          source={{ uri: assetContentUrl(assetId), headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined }}
          contentFit="cover"
          style={{ width: '100%', height: '100%' }}
          cachePolicy="memory-disk"
          onError={() => setFailed(assetId)}
        />
      ) : (
        <Package size={20} color={c['muted-foreground']} />
      )}
    </View>
  );
}

/** Final unit price per unit (excl. VAT), the list price struck through when lower, and why. */
export function PriceBlock({ price, currency, unit, size = 'default' }: { price: PriceResolution; currency: Currency; unit: string; size?: 'default' | 'lg' }) {
  const t = useT('product');
  const source = priceSource(price);
  return (
    <View className="gap-1">
      <View className="flex-row flex-wrap items-baseline gap-x-1.5">
        <AppText mono weight="semibold" className={`text-foreground ${size === 'lg' ? 'text-2xl' : 'text-base'}`}>
          {formatMoney(price.finalUnitPrice, currency)}
        </AppText>
        <AppText className="text-sm text-muted-foreground">{t('perUnit', { unit })}</AppText>
        {isDiscounted(price) && (
          <AppText mono className="text-sm text-muted-foreground line-through">
            {formatMoney(price.baseUnitPrice, currency)}
          </AppText>
        )}
      </View>
      <View className="flex-row flex-wrap items-center gap-1">
        {source === 'PROMOTION' && price.appliedPromotion && <Badge variant="success">{price.appliedPromotion.name}</Badge>}
        {source === 'AGREED' && <Badge variant="brand">{t('agreedPrice')}</Badge>}
        {source === 'TIER' && price.reachedTierThreshold !== null && (
          <Badge variant="info">{t('tierPrice', { qty: formatNumber(price.reachedTierThreshold) })}</Badge>
        )}
        <AppText className="text-xs text-muted-foreground">{t('netPrice')}</AppText>
      </View>
    </View>
  );
}

export function OfferBadges({ offer, extra }: { offer: Offer; extra?: string }) {
  const t = useT('product');
  const { minimumQuantity, quantityStep } = offer.product;
  const stock = offerStockStatus(offer);
  return (
    <View className="flex-row flex-wrap gap-1">
      {minimumQuantity > 1 && <Badge>{t('minShort', { qty: formatNumber(minimumQuantity) })}</Badge>}
      {quantityStep > 1 && <Badge>{t('stepShort', { qty: formatNumber(quantityStep) })}</Badge>}
      {stock.kind === 'OUT' && <Badge variant="destructive">{t('outOfStock')}</Badge>}
      {stock.kind === 'AVAILABLE' && <Badge variant="secondary">{t('inStock', { qty: formatNumber(stock.quantity) })}</Badge>}
      {stock.kind === 'UNCONFIRMED' && <Badge variant="warning">{t('stockUnconfirmed')}</Badge>}
      {extra ? <Badge variant="secondary">{extra}</Badge> : null}
    </View>
  );
}

/** Shared-favorite heart. Errors are reported through `onError` (a toast-free platform). */
export function FavoriteButton({ offer, onError }: { offer: Offer; onError?: (message: string) => void }) {
  const c = useTokenColors();
  const t = useT('product');
  const errorText = useErrorText();
  const favorites = useFavorites();
  const toggle = useToggleFavorite();
  const productId = offer.product.id;
  const on = favorites.data?.some((f) => f.productId === productId) ?? false;
  return (
    <Pressable
      accessibilityRole="button"
      aria-pressed={on}
      accessibilityLabel={on ? t('unfavorite', { product: offer.product.name }) : t('favorite', { product: offer.product.name })}
      hitSlop={8}
      disabled={favorites.isPending}
      onPress={() => toggle.mutate({ productId, on: !on, offer }, { onError: (e) => onError?.(errorText(e)) })}>
      <Heart size={20} color={on ? c.primary : c['muted-foreground']} fill={on ? c.primary : 'transparent'} />
    </Pressable>
  );
}

/** −/+ producing only valid quantities (minimum, then whole steps); typed input snaps up on blur. */
export function QuantityStepper({ value, rule, onChange, label }: { value: number; rule: QuantityRule; onChange: (v: number) => void; label: string }) {
  const c = useTokenColors();
  const t = useT('product');
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = snapQuantity(Number(draft), rule);
    setDraft(null);
    if (next !== value) onChange(next);
  };
  const atMinimum = value <= rule.minimumQuantity;
  return (
    <View className={`h-11 flex-row items-center rounded-lg border bg-background ${isValidQuantity(value, rule) ? 'border-input' : 'border-destructive'}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('decrease', { label })}
        disabled={atMinimum}
        onPress={() => onChange(stepQuantity(value, rule, -1))}
        className={`h-full w-10 items-center justify-center ${atMinimum ? 'opacity-40' : ''}`}>
        <Minus size={16} color={c.foreground} />
      </Pressable>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        maxLength={10}
        value={draft ?? String(value)}
        onChangeText={(v) => setDraft(v.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onSubmitEditing={commit}
        selectionColor={c.primary}
        className="h-full min-w-12 px-1 text-center font-mono text-base text-foreground"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('increase', { label })}
        onPress={() => onChange(stepQuantity(value, rule, 1))}
        className="h-full w-10 items-center justify-center">
        <Plus size={16} color={c.foreground} />
      </Pressable>
    </View>
  );
}

/** Adds to the active vendor's cart, keeping the resulting line quantity valid. */
export function useAddToCart() {
  const cart = useCart();
  return (offer: Offer, quantity: number) => {
    const inCart = cart.quantityOf(offer.product.id);
    const sum = inCart + quantity;
    const target = isValidQuantity(sum, offer.product) ? sum : snapQuantity(sum, offer.product);
    cart.add(offer, target - inCart);
  };
}

export function QuickAdd({ offer }: { offer: Offer }) {
  const c = useTokenColors();
  const t = useT('product');
  const cart = useCart();
  const add = useAddToCart();
  const inCart = cart.quantityOf(offer.product.id);
  const quantity = inCart > 0 ? offer.product.quantityStep : offer.product.minimumQuantity;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('addAria', { qty: formatNumber(quantity), product: offer.product.name })}
      onPress={() => add(offer, quantity)}
      className={`h-9 flex-row items-center gap-1.5 rounded-lg px-3 ${inCart ? 'border border-border bg-background active:bg-muted' : 'bg-primary active:bg-primary-hover'}`}>
      <ShoppingCart size={14} color={inCart ? c.foreground : c['primary-foreground']} />
      <AppText weight="medium" className={`text-sm ${inCart ? 'text-foreground' : 'text-primary-foreground'}`}>
        {inCart ? t('inCartAdd', { qty: formatNumber(inCart), step: formatNumber(quantity) }) : quantity > 1 ? t('addQty', { qty: formatNumber(quantity) }) : t('add')}
      </AppText>
    </Pressable>
  );
}

const openProduct = (productId: string) => router.push({ pathname: '/buyer/product/[id]', params: { id: productId } });

/** Full-width offer row (Home results, Favorites). */
export function ProductRow({ offer, extra }: { offer: Offer; extra?: string }) {
  const t = useT('mProduct');
  const { product } = offer;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={t('open', { product: product.name })} onPress={() => openProduct(product.id)} className="gap-2 px-4 py-3 active:bg-muted">
      <View className="flex-row items-start gap-3">
        <OfferImage assetId={product.galleryAssetIds[0]} className="size-16" />
        <View className="flex-1 gap-0.5">
          <AppText weight="medium" className="text-base text-foreground" numberOfLines={2}>
            {product.name}
          </AppText>
          <AppText className="text-xs text-muted-foreground" numberOfLines={1}>
            {product.packDescription ? `${product.sku} · ${product.packDescription}` : product.sku}
          </AppText>
        </View>
        <FavoriteButton offer={offer} />
      </View>
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1 gap-1">
          <PriceBlock price={offer.effectivePrice} currency={offer.currency} unit={offer.unitName} />
          <OfferBadges offer={offer} extra={extra} />
        </View>
        <QuickAdd offer={offer} />
      </View>
    </Pressable>
  );
}

/** Compact card for the horizontal shelves on Home. */
export function ShelfCard({ offer }: { offer: Offer }) {
  const t = useT('mProduct');
  const { product } = offer;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('open', { product: product.name })}
      onPress={() => openProduct(product.id)}
      className="w-60 justify-between gap-3 rounded-xl border border-border bg-card p-3 active:bg-muted">
      <View className="gap-2">
        <OfferImage assetId={product.galleryAssetIds[0]} className="w-full" style={{ aspectRatio: 4 / 3 }} />
        <AppText weight="medium" className="text-sm text-card-foreground" numberOfLines={2}>
          {product.name}
        </AppText>
        <PriceBlock price={offer.effectivePrice} currency={offer.currency} unit={offer.unitName} />
      </View>
      <QuickAdd offer={offer} />
    </Pressable>
  );
}

/** Selectable row with a check (vendor switcher, delivery locations). */
export function OptionRow({ title, subtitle, selected, onPress, icon }: { title: string; subtitle?: string; selected: boolean; onPress: () => void; icon?: React.ReactNode }) {
  const c = useTokenColors();
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={selected}
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3 ${selected ? 'bg-primary-subtle' : 'active:bg-muted'}`}>
      {icon}
      <View className="flex-1 gap-0.5">
        <AppText weight="medium" className="text-base text-foreground">
          {title}
        </AppText>
        {subtitle ? <AppText className="text-sm text-muted-foreground">{subtitle}</AppText> : null}
      </View>
      {selected && <Check size={18} color={c.primary} />}
    </Pressable>
  );
}

/** Inline status line (mobile has no toasts): success or error text announced to screen readers. */
export function Notice({ text, tone = 'success' }: { text: string; tone?: 'success' | 'error' | 'muted' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'error' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <AppText accessibilityRole="alert" className={`text-sm ${color}`}>
      {text}
    </AppText>
  );
}
