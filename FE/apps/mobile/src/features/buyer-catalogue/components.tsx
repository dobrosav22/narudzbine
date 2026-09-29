import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Heart, Minus, Plus, ShoppingCart } from 'lucide-react-native';
import { formatNumber, formatMoney, priceNote, type CatalogueItem, type Product, type ResolvedPrice } from '@repo/core';
import { ProductImage } from '@/components/product-image';
import { AppText } from '@/components/app-text';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/lib/cart';
import { useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useFavorites, useToggleFavorite } from './queries';
import { useMsg, useT } from '@/lib/i18n';

export function PriceBlock({ price, unit, size = 'default' }: { price: ResolvedPrice; unit: string; size?: 'default' | 'lg' }) {
  const tm = useMsg();
  // Shared with web (@repo/core): negotiated = brand violet, promotion = success green.
  const note = priceNote(price);
  return (
    <View className="gap-1">
      <View className="flex-row flex-wrap items-baseline gap-x-1.5">
        <AppText mono weight="semibold" className={`text-foreground ${size === 'lg' ? 'text-2xl' : 'text-base'}`}>
          {formatMoney(price.unitPrice)}
        </AppText>
        <AppText className="text-sm text-muted-foreground">/ {unit}</AppText>
        {price.unitPrice < price.basePrice && (
          <AppText mono className="text-sm text-muted-foreground line-through">
            {formatMoney(price.basePrice)}
          </AppText>
        )}
      </View>
      {note && <Badge variant={note.variant}>{tm(note.msg)}</Badge>}
    </View>
  );
}

export function FavoriteButton({ productId, productName }: { productId: string; productName: string }) {
  const c = useTokenColors();
  const t = useT('catalogue');
  const { membership } = useSignedIn();
  const favorites = useFavorites(membership.user.id);
  const toggle = useToggleFavorite(membership.user.id);
  const on = favorites.data?.some((f) => f.productId === productId) ?? false;
  return (
    <Pressable
      accessibilityRole="button"
      aria-pressed={on}
      accessibilityLabel={on ? t('unfavorite', { product: productName }) : t('favorite', { product: productName })}
      hitSlop={8}
      disabled={favorites.isPending}
      onPress={() => toggle.mutate(productId)}>
      <Heart size={20} color={on ? c.primary : c['muted-foreground']} fill={on ? c.primary : 'transparent'} />
    </Pressable>
  );
}

/** −/+ with a typed value committed on blur/submit; never below `min` (minimum order). */
export function QuantityStepper({ value, min, onChange, label }: { value: number; min: number; onChange: (v: number) => void; label: string }) {
  const c = useTokenColors();
  const t = useT('catalogue');
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.floor(Number(draft));
    const next = Number.isFinite(n) && n >= min ? n : min;
    setDraft(null);
    if (next !== value) onChange(next);
  };
  return (
    <View className="h-11 flex-row items-center rounded-lg border border-input bg-background">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('decrease', { label })}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        className={`h-full w-10 items-center justify-center ${value <= min ? 'opacity-40' : ''}`}>
        <Minus size={16} color={c.foreground} />
      </Pressable>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        value={draft ?? String(value)}
        onChangeText={(v) => setDraft(v.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onSubmitEditing={commit}
        selectionColor={c.primary}
        className="h-full w-12 text-center font-mono text-base text-foreground"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('increase', { label })}
        onPress={() => onChange(value + 1)}
        className="h-full w-10 items-center justify-center">
        <Plus size={16} color={c.foreground} />
      </Pressable>
    </View>
  );
}

/** Quick add from a list row: adds the minimum order quantity (or 1). */
export function QuickAdd({ product, quantity }: { product: Product; quantity: number }) {
  const c = useTokenColors();
  const t = useT('catalogue');
  const cart = useCart();
  const inCart = cart.quantityOf(product.id);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('addAria', { qty: formatNumber(quantity), product: product.name })}
      onPress={() => cart.add(product.id, quantity)}
      className={`h-9 flex-row items-center gap-1.5 rounded-lg px-3 ${inCart ? 'border border-border bg-background active:bg-muted' : 'bg-primary active:bg-primary-hover'}`}>
      <ShoppingCart size={14} color={inCart ? c.foreground : c['primary-foreground']} />
      <AppText weight="medium" className={`text-sm ${inCart ? 'text-foreground' : 'text-primary-foreground'}`}>
        {inCart ? t('inCartAdd', { qty: formatNumber(inCart) }) : quantity > 1 ? t('addQty', { qty: formatNumber(quantity) }) : t('add')}
      </AppText>
    </Pressable>
  );
}

/** Full-width list row used on Home results and Favorites. */
export function ProductRow({ item, extra }: { item: CatalogueItem; extra?: string }) {
  const t = useT('catalogue');
  const { product, price } = item;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('open', { product: product.name })}
      onPress={() => router.push({ pathname: '/buyer/product/[id]', params: { id: product.id } })}
      className="gap-2 px-4 py-3 active:bg-muted">
      <View className="flex-row items-start gap-3">
        <ProductImage src={product.imageUrl} className="size-16" />
        <View className="flex-1 gap-0.5">
          <AppText weight="medium" className="text-base text-foreground" numberOfLines={2}>
            {product.name}
          </AppText>
          <AppText mono className="text-xs text-muted-foreground">
            {product.sku}
          </AppText>
        </View>
        <FavoriteButton productId={product.id} productName={product.name} />
      </View>
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1 gap-1">
          <PriceBlock price={price} unit={product.unit} />
          <View className="flex-row flex-wrap gap-1">
            {product.minOrderQuantity && product.minOrderQuantity > 1 ? <Badge>{t('minShort', { qty: formatNumber(product.minOrderQuantity) })}</Badge> : null}
            {product.stock === 0 && <Badge variant="destructive">{t('outOfStock')}</Badge>}
            {extra ? <Badge variant="secondary">{extra}</Badge> : null}
          </View>
        </View>
        <QuickAdd product={product} quantity={price.quantity} />
      </View>
    </Pressable>
  );
}

/** Compact card for the horizontal shelves on Home. */
export function ShelfCard({ item, extra }: { item: CatalogueItem; extra?: string }) {
  const t = useT('catalogue');
  const { product, price } = item;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('open', { product: product.name })}
      onPress={() => router.push({ pathname: '/buyer/product/[id]', params: { id: product.id } })}
      className="w-60 justify-between gap-3 rounded-xl border border-border bg-card p-3 active:bg-muted">
      <View className="gap-2">
        <ProductImage src={product.imageUrl} className="w-full" style={{ aspectRatio: 4 / 3 }} />
        <AppText weight="medium" className="text-sm text-card-foreground" numberOfLines={2}>
          {product.name}
        </AppText>
        <PriceBlock price={price} unit={product.unit} />
        {extra ? <Badge variant="secondary">{extra}</Badge> : null}
      </View>
      <QuickAdd product={product} quantity={price.quantity} />
    </Pressable>
  );
}
