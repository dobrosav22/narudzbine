import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Trash2, X } from 'lucide-react-native';
import {
  currencySymbol,
  emptyProductDraft,
  formatMoney,
  formatPercent,
  isAtLimit,
  isServiceError,
  parseDecimal,
  productToDraft,
  tiersToDrafts,
  toDecimalInput,
  validateProductDraft,
  validateTierDrafts,
  type Category,
  type DraftErrors,
  type PriceTier,
  type Product,
  type ProductDraft,
  type Tag,
  type TierDraft,
  type VendorOrg,
  type VendorPlan,
  type Msg,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { AffixInput } from '@/components/ui/affix-input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { FormError } from '@/components/ui/form-error';
import { SwitchRow } from '@/components/ui/switch-row';
import { PlanLimitNotice } from '@/features/subscription/plan-limit';
import { ProductImageSection } from './product-image-section';
import { useTokenColors } from '@/theme';
import {
  useBuyerConnections,
  useBuyerOverrides,
  useCategories,
  useDeleteBuyerOverride,
  useDeleteProduct,
  usePriceTiers,
  useProduct,
  useSaveProduct,
  useSetBuyerOverride,
  useVendorPlan,
  useTags,
  useVendorOrg,
} from './queries';
import { useErrorText, useMsg, useT } from '@/lib/i18n';

/** 03 → "Product detail/edit" on mobile — same core validation as web. `productId` undefined = new. */
export function ProductEditor({ vendorOrgId, productId }: { vendorOrgId: string; productId?: string }) {
  const t = useT('productEditor');
  const tmc = useT('m.common');
  const org = useVendorOrg(vendorOrgId);
  const categories = useCategories(vendorOrgId);
  const tags = useTags(vendorOrgId);
  const usage = useVendorPlan(vendorOrgId);
  const product = useProduct(productId);
  const tiers = usePriceTiers(productId);
  const queries = productId ? [org, categories, tags, usage, product, tiers] : [org, categories, tags, usage];
  const failed = queries.find((q) => q.isError);

  if (productId && isServiceError(product.error, 'NOT_FOUND')) {
    return <EmptyState title={t('notFoundTitle')} description={t('notFoundDescription')} />;
  }
  if (failed) return <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />;
  if (queries.some((q) => q.isPending)) return <LoadingState label={tmc('loadingProduct')} />;

  return (
    <ProductForm
      key={productId ?? 'new'}
      vendorOrgId={vendorOrgId}
      org={org.data!}
      categories={categories.data!}
      tags={tags.data!}
      usage={usage.data!}
      product={product.data}
      tiers={tiers.data ?? []}
    />
  );
}

function ProductForm({
  vendorOrgId,
  org,
  categories,
  tags,
  usage,
  product,
  tiers,
}: {
  vendorOrgId: string;
  org: VendorOrg;
  categories: Category[];
  tags: Tag[];
  usage: VendorPlan;
  product?: Product;
  tiers: PriceTier[];
}) {
  const c = useTokenColors();
  const t = useT('productEditor');
  const tmo = useT('m.editor');
  const tm = useMsg();
  const errorText = useErrorText();
  const isNew = !product;
  const [draft, setDraft] = useState<ProductDraft>(() => (product ? productToDraft(product) : emptyProductDraft()));
  const [tierDrafts, setTierDrafts] = useState<TierDraft[]>(() => tiersToDrafts(tiers));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [tierErrors, setTierErrors] = useState<(Msg | undefined)[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveProduct(vendorOrgId);
  const remove = useDeleteProduct(vendorOrgId);
  const atLimit = isNew && isAtLimit(usage, 'products');
  const planLimitHit = atLimit || isServiceError(save.error, 'PLAN_LIMIT');
  const skuConflict = isServiceError(save.error, 'CONFLICT') ? errorText(save.error) : undefined;
  const err = (m: Msg | undefined) => (m ? tm(m) : undefined);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setTier = (i: number, patch: Partial<TierDraft>) => {
    setTierDrafts((ts) => ts.map((tier, j) => (j === i ? { ...tier, ...patch } : tier)));
    setTierErrors((es) => es.map((e, j) => (j === i ? undefined : e)));
  };

  const submit = () => {
    const result = validateProductDraft(draft, { tracksInventory: org.tracksInventory });
    const tierResult = validateTierDrafts(tierDrafts, parseDecimal(draft.basePrice));
    setErrors(result.ok ? {} : result.errors);
    setTierErrors(tierResult.ok ? [] : tierResult.errors);
    if (!result.ok || !tierResult.ok) return;
    save.mutate({ productId: product?.id, values: result.value, tiers: tierResult.value }, { onSuccess: () => router.back() });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: isNew ? t('newTitle') : product.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" disabled={save.isPending || atLimit} onPress={submit} hitSlop={8}>
              <AppText weight="semibold" className={`text-base text-primary ${save.isPending || atLimit ? 'opacity-50' : ''}`}>
                {tmo('save')}
              </AppText>
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-16">
        {planLimitHit && <PlanLimitNotice plan={usage} limit="products" />}
        {save.error && !planLimitHit && !skuConflict ? <FormError error={save.error} /> : null}

        <Card>
          <CardHeader title={t('details')} />
          <FieldGroup>
            <Field label={t('name')}>
              <Input value={draft.name} onChangeText={(v) => set('name', v)} accessibilityLabel={t('name')} />
              <FieldError>{err(errors.name)}</FieldError>
            </Field>
            <Field label={t('sku')}>
              <Input
                value={draft.sku}
                autoCapitalize="characters"
                autoCorrect={false}
                className="font-mono"
                accessibilityLabel={t('sku')}
                onChangeText={(v) => {
                  set('sku', v);
                  if (skuConflict) save.reset();
                }}
              />
              <FieldError>{err(errors.sku) ?? skuConflict}</FieldError>
            </Field>
            <Field label={t('description')}>
              <Input
                value={draft.description}
                onChangeText={(v) => set('description', v)}
                multiline
                className="h-24 py-2"
                textAlignVertical="top"
                accessibilityLabel={t('description')}
              />
            </Field>
            {categories.length > 0 && (
              <Field label={t('category')}>
                <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
                  <Chip role="radio" label={t('none')} selected={!draft.categoryId} onPress={() => set('categoryId', '')} />
                  {categories.map((cat) => (
                    <Chip key={cat.id} role="radio" label={cat.name} selected={draft.categoryId === cat.id} onPress={() => set('categoryId', cat.id)} />
                  ))}
                </View>
              </Field>
            )}
            {tags.length > 0 && (
              <Field label={t('tags')}>
                <View className="flex-row flex-wrap gap-2">
                  {tags.map((tag) => {
                    const on = draft.tagIds.includes(tag.id);
                    return (
                      <Chip
                        key={tag.id}
                        label={tag.name}
                        selected={on}
                        onPress={() => set('tagIds', on ? draft.tagIds.filter((x) => x !== tag.id) : [...draft.tagIds, tag.id])}
                      />
                    );
                  })}
                </View>
              </Field>
            )}
          </FieldGroup>
        </Card>

        <Card>
          <CardHeader title={t('pricing')} description={tmo('pricingDescription')} />
          <FieldGroup>
            <Field label={t('basePrice')}>
              <AffixInput
                mono
                suffix={currencySymbol()}
                keyboardType="decimal-pad"
                placeholder="0,00"
                invalid={!!errors.basePrice}
                value={draft.basePrice}
                onChangeText={(v) => set('basePrice', v)}
                accessibilityLabel={t('basePrice')}
              />
              <FieldError>{err(errors.basePrice)}</FieldError>
            </Field>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label={t('unit')}>
                  <Input value={draft.unit} placeholder={t('unitPlaceholder')} onChangeText={(v) => set('unit', v)} accessibilityLabel={t('unit')} />
                  <FieldError>{err(errors.unit)}</FieldError>
                </Field>
              </View>
              <View className="flex-1">
                <Field label={t('minimumOrder')}>
                  <Input
                    value={draft.minOrderQuantity}
                    placeholder={t('none')}
                    keyboardType="number-pad"
                    onChangeText={(v) => set('minOrderQuantity', v)}
                    accessibilityLabel={t('minimumOrder')}
                  />
                  <FieldError>{err(errors.minOrderQuantity)}</FieldError>
                </Field>
              </View>
            </View>
            <Field label={t('tiers')} description={tmo('tiersDescription')}>
              {tierDrafts.map((tier, i) => (
                <View key={i} className="gap-1">
                  <View className="flex-row items-center gap-2">
                    <AffixInput
                      className="flex-1"
                      prefix={t('from')}
                      keyboardType="number-pad"
                      invalid={!!tierErrors[i]}
                      value={tier.minQty}
                      onChangeText={(v) => setTier(i, { minQty: v })}
                      accessibilityLabel={t('tierMinAria', { n: i + 1 })}
                    />
                    <AffixInput
                      className="flex-1"
                      mono
                      suffix={currencySymbol()}
                      keyboardType="decimal-pad"
                      invalid={!!tierErrors[i]}
                      value={tier.pricePerUnit}
                      onChangeText={(v) => setTier(i, { pricePerUnit: v })}
                      accessibilityLabel={t('tierPriceAria', { n: i + 1 })}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('tierRemoveAria', { n: i + 1 })}
                      hitSlop={8}
                      onPress={() => {
                        setTierDrafts((ts) => ts.filter((_, j) => j !== i));
                        setTierErrors((es) => es.filter((_, j) => j !== i));
                      }}>
                      <X size={18} color={c['muted-foreground']} />
                    </Pressable>
                  </View>
                  <FieldError>{err(tierErrors[i])}</FieldError>
                </View>
              ))}
              <Button variant="outline" size="sm" className="self-start" onPress={() => setTierDrafts((ts) => [...ts, { minQty: '', pricePerUnit: '' }])}>
                {t('addTier')}
              </Button>
            </Field>
          </FieldGroup>
        </Card>

        {/* 01 §3: no stock UI at all when the vendor doesn't track inventory. */}
        {org.tracksInventory && (
          <Card>
            <CardHeader title={t('inventory')} />
            <Field label={t('inStock')}>
              <AffixInput
                mono
                suffix={draft.unit || t('units')}
                keyboardType="number-pad"
                placeholder="0"
                invalid={!!errors.stock}
                value={draft.stock}
                onChangeText={(v) => set('stock', v)}
                accessibilityLabel={t('inStock')}
              />
              <FieldError>{err(errors.stock)}</FieldError>
            </Field>
          </Card>
        )}

        <ProductImageSection vendorOrgId={vendorOrgId} productName={draft.name} value={draft.imageUrl} onChange={(url) => set('imageUrl', url)} />

        <Card>
          <SwitchRow label={t('active')} description={t('activeDescription')} value={draft.isActive} onValueChange={(v) => set('isActive', v)} />
        </Card>

        {!isNew && <BuyerPrices vendorOrgId={vendorOrgId} product={product} />}

        <Button loading={save.isPending} disabled={atLimit} onPress={submit}>
          {isNew ? t('addProduct') : t('saveChanges')}
        </Button>

        {!isNew &&
          (confirmDelete ? (
            <View className="gap-2 rounded-lg border border-border p-3">
              <AppText className="text-sm text-foreground">
                {tmo('deleteConfirm')}
              </AppText>
              <View className="flex-row gap-2">
                <Button variant="outline" size="sm" onPress={() => setConfirmDelete(false)}>
                  {t('cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  loading={remove.isPending}
                  onPress={() => remove.mutate(product.id, { onSuccess: () => router.back() })}>
                  {t('deleteProduct')}
                </Button>
              </View>
              {remove.error ? <FormError error={remove.error} /> : null}
            </View>
          ) : (
            <Button variant="destructive" onPress={() => setConfirmDelete(true)}>
              {t('delete')}
            </Button>
          ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Per-buyer negotiated prices — saved immediately, like web's BuyerPricesCard. */
function BuyerPrices({ vendorOrgId, product }: { vendorOrgId: string; product: Product }) {
  const c = useTokenColors();
  const t = useT('buyerPrices');
  const tmo = useT('m.editor');
  const tmc = useT('m.common');
  const overrides = useBuyerOverrides(vendorOrgId, product.id);
  const connections = useBuyerConnections(vendorOrgId);
  const setOverride = useSetBuyerOverride(vendorOrgId, product.id);
  const deleteOverride = useDeleteBuyerOverride(vendorOrgId, product.id);
  const [buyerOrgId, setBuyerOrgId] = useState<string>();
  const [price, setPrice] = useState('');
  const [priceError, setPriceError] = useState<string>();

  if (overrides.isError || connections.isError) {
    return <ErrorState error={overrides.error ?? connections.error} onRetry={() => void Promise.all([overrides.refetch(), connections.refetch()])} />;
  }
  if (overrides.isPending || connections.isPending) return <LoadingState label={tmc('loadingBuyerPrices')} />;

  const name = new Map(connections.data.map((x) => [x.buyerOrg.id, x.buyerOrg.name]));
  const active = connections.data.filter((x) => x.relation.status === 'active');
  const existing = overrides.data.find((o) => o.buyerOrgId === buyerOrgId);

  const submit = () => {
    const value = parseDecimal(price);
    if (!buyerOrgId) return;
    if (value === undefined || value < 0) return setPriceError(t('priceInvalid'));
    setOverride.mutate({ buyerOrgId, price: value }, { onSuccess: () => { setBuyerOrgId(undefined); setPrice(''); } });
  };

  return (
    <Card>
      <CardHeader title={t('title')} description={tmo('buyerPricesDescription')} />
      {overrides.data.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">{t('empty')}</AppText>
      ) : (
        <View className="overflow-hidden rounded-lg border border-border">
          {overrides.data.map((o, i) => {
            const diff = product.basePrice > 0 ? ((o.price - product.basePrice) / product.basePrice) * 100 : 0;
            return (
              <View key={o.id}>
                {i > 0 && <View className="h-px bg-border" />}
                <View className="flex-row items-center gap-3 p-3">
                  <AppText className="flex-1 text-sm text-foreground">{name.get(o.buyerOrgId) ?? t('formerBuyer')}</AppText>
                  <View className="items-end">
                    <AppText mono className="text-sm text-foreground">{formatMoney(o.price)}</AppText>
                    <AppText mono className="text-xs text-muted-foreground">{`${diff > 0 ? '+' : ''}${formatPercent(Math.round(diff * 10) / 10)}`}</AppText>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('removeAria', { buyer: name.get(o.buyerOrgId) ?? t('buyerFallback') })}
                    hitSlop={8}
                    disabled={deleteOverride.isPending}
                    onPress={() => deleteOverride.mutate(o)}>
                    <Trash2 size={18} color={c['muted-foreground']} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
      {active.length > 0 && (
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {active.map((x) => (
              <Chip
                key={x.buyerOrg.id}
                role="radio"
                label={x.buyerOrg.name}
                selected={buyerOrgId === x.buyerOrg.id}
                onPress={() => {
                  setBuyerOrgId(x.buyerOrg.id);
                  const current = overrides.data.find((o) => o.buyerOrgId === x.buyerOrg.id);
                  setPrice(current ? toDecimalInput(current.price) : '');
                  setPriceError(undefined);
                }}
              />
            ))}
          </View>
          {buyerOrgId && (
            <View className="flex-row items-start gap-2">
              <View className="flex-1 gap-1">
                <AffixInput
                  mono
                  suffix={currencySymbol()}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  invalid={!!priceError}
                  value={price}
                  onChangeText={(v) => {
                    setPrice(v);
                    setPriceError(undefined);
                  }}
                  accessibilityLabel={t('negotiated')}
                />
                <FieldError>{priceError}</FieldError>
              </View>
              <Button variant="outline" loading={setOverride.isPending} disabled={!price} onPress={submit}>
                {existing ? tmo('update') : t('setPrice')}
              </Button>
            </View>
          )}
        </View>
      )}
      {setOverride.error ? <FormError error={setOverride.error} /> : null}
    </Card>
  );
}
