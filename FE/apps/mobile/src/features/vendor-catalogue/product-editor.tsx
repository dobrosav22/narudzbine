import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import {
  catalogueQueries,
  currencySymbol,
  emptyProductDraft,
  fieldProblemMsg,
  formatMoney,
  isApiError,
  parsePriceInput,
  pricingToDraft,
  pricingUnchanged,
  priceToInput,
  productCommands,
  productFieldsUnchanged,
  productLimitReached,
  productToDraft,
  sameCatalogueFields,
  updatePricing,
  uuidv7,
  validatePricingDraft,
  validateProductDraft,
  type AgreedPrice,
  type CatalogueBuyer,
  type Msg,
  type NamedResource,
  type Pricing,
  type PricingDraft,
  type PricingErrors,
  type Product,
  type ProductCommand,
  type ProductDraft,
  type ProductDraftErrors,
  type Unit,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { AffixInput } from '@/components/ui/affix-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { SwitchRow } from '@/components/ui/switch-row';
import { useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useMsg, useT } from '@/lib/i18n';
import { CatalogueFormError, ProductStateBadge, useCatalogueErrorText } from './parts';
import { ProductImageSection } from './product-image-section';
import { StockSection } from './stock-section';
import {
  useAgreedPriceMutations,
  useAgreedPrices,
  useCatalogueBuyers,
  useCreateProduct,
  usePlanUsage,
  usePricing,
  useProduct,
  useProductCommand,
  useSetFeatured,
  useTaxonomy,
  useUpdatePricing,
  useUpdateProduct,
} from './queries';

/** Product detail/edit on mobile — same core validation and save rules as web. `productId` undefined = new. */
export function ProductEditor({ productId }: { productId?: string }) {
  const t = useT('productEditor');
  const tmc = useT('mCommon');
  const product = useProduct(productId);
  const pricing = usePricing(productId);
  const units = useTaxonomy('units');
  const categories = useTaxonomy('categories');
  const tags = useTaxonomy('tags');
  const queries = productId ? [product, pricing, units, categories, tags] : [units, categories, tags];

  if (productId && isApiError(product.error, 'NOT_FOUND')) return <EmptyState title={t('notFoundTitle')} description={t('notFoundDescription')} />;
  const failed = queries.find((q) => q.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />;
  if (queries.some((q) => q.isPending)) return <LoadingState label={tmc('loadingProduct')} />;

  return (
    <ProductForm key={productId ?? 'new'} product={product.data} pricing={pricing.data} units={units.data!} categories={categories.data!} tags={tags.data!} />
  );
}

function ProductForm({
  product,
  pricing,
  units,
  categories,
  tags,
}: {
  product: Product | undefined;
  pricing: Pricing | undefined;
  units: Unit[];
  categories: NamedResource[];
  tags: NamedResource[];
}) {
  const c = useTokenColors();
  const t = useT('productEditor');
  const tmo = useT('mEditor');
  const tv = useT('vendorCatalogue');
  const tm = useMsg();
  const qc = useQueryClient();
  const { organization } = useBusiness();
  const currency = organization.currency;
  const isNew = !product;
  const [baseline, setBaseline] = useState({ product, pricing });
  const [draft, setDraft] = useState<ProductDraft>(() => (product ? productToDraft(product) : emptyProductDraft()));
  const [priceDraft, setPriceDraft] = useState<PricingDraft>(() => pricingToDraft(pricing));
  const [errors, setErrors] = useState<ProductDraftErrors>({});
  const [priceErrors, setPriceErrors] = useState<PricingErrors>({ tiers: [] });
  const [createId] = useState(() => uuidv7());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>();
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? '');
  const savePricing = useUpdatePricing(product?.id ?? '');
  const plan = usePlanUsage();
  const error = create.error ?? update.error ?? savePricing.error;
  const conflict = isApiError(error, 'REVISION_CONFLICT');
  const planLimit = isApiError(error, 'PLAN_LIMIT_EXCEEDED') || (isNew && productLimitReached(plan.data));
  const frozen = !!product?.unitAndPackFrozen;
  const err = (m: Msg | undefined) => (m ? tm(m) : undefined);
  const serverField = (path: string) => {
    const m = fieldProblemMsg(isApiError(error) ? error.fieldCode(path) : undefined);
    return m ? tm(m) : undefined;
  };
  const resetErrors = () => {
    create.reset();
    update.reset();
    savePricing.reset();
    setNotice(undefined);
  };
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (error && !conflict) resetErrors();
  };
  const setPrice = (patch: Partial<PricingDraft>) => {
    setPriceDraft((d) => ({ ...d, ...patch }));
    setPriceErrors({ tiers: [] });
  };

  const reload = async () => {
    if (!product) return;
    resetErrors();
    const [p, pr] = await Promise.all([
      qc.fetchQuery({ ...catalogueQueries.product(product.id), staleTime: 0 }),
      qc.fetchQuery({ ...catalogueQueries.pricing(product.id), staleTime: 0 }),
    ]);
    setBaseline({ product: p, pricing: pr });
    setDraft(productToDraft(p));
    setPriceDraft(pricingToDraft(pr));
  };

  const submit = async () => {
    const fields = validateProductDraft(draft);
    const rules = fields.ok ? { minimumQuantity: fields.value.minimumQuantity, quantityStep: fields.value.quantityStep } : { minimumQuantity: 1, quantityStep: 1 };
    const prices = validatePricingDraft(priceDraft, rules);
    setErrors(fields.ok ? {} : fields.errors);
    setPriceErrors(prices.ok ? { tiers: [] } : prices.errors);
    if (!fields.ok || !prices.ok) return;
    resetErrors();
    setSaving(true);
    try {
      if (isNew) {
        const created = await create.mutateAsync({ id: createId, ...fields.value });
        if (prices.value.basePrice !== null) {
          try {
            const current = await qc.fetchQuery({ ...catalogueQueries.pricing(created.id), staleTime: 0 });
            await updatePricing(created.id, { expectedRevision: current.revision, ...prices.value, deactivateProduct: false });
            await qc.invalidateQueries({ queryKey: catalogueQueries.pricing(created.id).queryKey });
          } catch {
            Alert.alert(t('createdWithoutPrice'));
          }
        }
        router.replace({ pathname: '/vendor/product/[id]', params: { id: created.id } });
        return;
      }
      const latest = qc.getQueryData<Product>(catalogueQueries.product(product.id).queryKey) ?? product;
      const latestPricing = qc.getQueryData<Pricing>(catalogueQueries.pricing(product.id).queryKey) ?? baseline.pricing;
      const base = baseline.product!;
      const detailsChanged = !productFieldsUnchanged(base, fields.value);
      const pricingChanged = !pricingUnchanged(baseline.pricing, prices.value);
      if (!detailsChanged && !pricingChanged) return setNotice(t('nothingChanged'));
      const productRevision = sameCatalogueFields(base, latest) ? latest.revision : base.revision;
      const pricingRevision =
        latestPricing && baseline.pricing && pricingUnchanged(latestPricing, { basePrice: baseline.pricing.basePrice, tiers: baseline.pricing.tiers })
          ? latestPricing.revision
          : baseline.pricing!.revision;
      const correction = pricingChanged ? { expectedRevision: pricingRevision, ...prices.value, deactivateProduct: false } : null;
      if (detailsChanged) {
        const saved = await update.mutateAsync({ expectedRevision: productRevision, ...fields.value, pricingCorrection: correction });
        const fresh = correction ? await qc.fetchQuery({ ...catalogueQueries.pricing(product.id), staleTime: 0 }) : latestPricing;
        setBaseline({ product: saved, pricing: fresh });
      } else {
        const saved = await savePricing.mutateAsync(correction!);
        setBaseline((b) => ({ ...b, pricing: saved }));
      }
      setNotice(t('saved'));
    } catch {
      // Shown from the mutation error state.
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: isNew ? t('newTitle') : baseline.product!.name,
          headerRight: () => (
            <Pressable accessibilityRole="button" disabled={saving || (isNew && planLimit)} onPress={() => void submit()} hitSlop={8}>
              <AppText weight="semibold" className={`text-base text-primary ${saving ? 'opacity-50' : ''}`}>
                {tmo('save')}
              </AppText>
            </Pressable>
          ),
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-16">
        {planLimit && (
          <View className="gap-2 rounded-lg border border-border bg-card p-3">
            <AppText weight="medium" className="text-sm text-foreground">
              {tv('planLimit.title')}
            </AppText>
            <Button size="sm" variant="outline" className="self-start" onPress={() => router.push('/vendor/plan')}>
              {tv('planLimit.link')}
            </Button>
          </View>
        )}
        {conflict ? (
          <View className="gap-2 rounded-lg border border-border bg-card p-3">
            <AppText className="text-sm text-destructive">{t('conflict')}</AppText>
            <Button size="sm" variant="outline" className="self-start" onPress={() => void reload()}>
              {t('reload')}
            </Button>
          </View>
        ) : (
          !planLimit && <CatalogueFormError error={error} />
        )}
        {notice && <AppText className="text-sm text-muted-foreground">{notice}</AppText>}

        <Card>
          <CardHeader title={t('details')} />
          <FieldGroup>
            <Field label={t('name')}>
              <Input value={draft.name} maxLength={200} onChangeText={(v) => set('name', v)} accessibilityLabel={t('name')} />
              <FieldError>{err(errors.name) ?? serverField('name')}</FieldError>
            </Field>
            <Field label={t('sku')} description={t('skuHint')}>
              <Input
                value={draft.sku}
                maxLength={64}
                autoCapitalize="characters"
                autoCorrect={false}
                className="font-mono"
                accessibilityLabel={t('sku')}
                onChangeText={(v) => set('sku', v)}
              />
              <FieldError>{err(errors.sku) ?? serverField('sku')}</FieldError>
            </Field>
            <Field label={t('description')}>
              <Input
                value={draft.description}
                onChangeText={(v) => set('description', v)}
                multiline
                maxLength={5000}
                className="h-24 py-2"
                textAlignVertical="top"
                accessibilityLabel={t('description')}
              />
              <FieldError>{err(errors.description)}</FieldError>
            </Field>
            <ChipField label={t('category')} none={t('noCategory')} options={categories} value={draft.categoryId} onChange={(v) => set('categoryId', v)} />
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
                <FieldError>{err(errors.tagIds)}</FieldError>
              </Field>
            )}
            {frozen ? (
              <Field label={t('unit')} description={t('frozen')}>
                <AppText className="text-sm text-foreground">
                  {[units.find((u) => u.id === draft.unitId)?.name ?? t('noUnit'), draft.packDescription].filter(Boolean).join(' · ')}
                </AppText>
              </Field>
            ) : (
              <>
                <ChipField label={t('unit')} none={t('noUnit')} options={units} value={draft.unitId} onChange={(v) => set('unitId', v)} hint={t('unitHint')} />
                <Field label={t('pack')}>
                  <Input value={draft.packDescription} maxLength={200} placeholder={t('packPlaceholder')} onChangeText={(v) => set('packDescription', v)} accessibilityLabel={t('pack')} />
                  <FieldError>{err(errors.packDescription)}</FieldError>
                </Field>
              </>
            )}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label={t('minimumQuantity')}>
                  <Input value={draft.minimumQuantity} keyboardType="number-pad" onChangeText={(v) => set('minimumQuantity', v)} accessibilityLabel={t('minimumQuantity')} />
                  <FieldError>{err(errors.minimumQuantity)}</FieldError>
                </Field>
              </View>
              <View className="flex-1">
                <Field label={t('quantityStep')}>
                  <Input value={draft.quantityStep} keyboardType="number-pad" onChangeText={(v) => set('quantityStep', v)} accessibilityLabel={t('quantityStep')} />
                  <FieldError>{err(errors.quantityStep)}</FieldError>
                </Field>
              </View>
            </View>
            <AppText className="text-sm text-muted-foreground">{t('quantityHint')}</AppText>
          </FieldGroup>
        </Card>

        <Card>
          <CardHeader title={t('pricing')} description={t('pricingDescription', { currency })} />
          <FieldGroup>
            <Field label={t('basePrice')} description={t('basePriceHint')}>
              <AffixInput
                mono
                suffix={currencySymbol(currency)}
                keyboardType="decimal-pad"
                placeholder="0,00"
                invalid={!!priceErrors.basePrice}
                value={priceDraft.basePrice}
                onChangeText={(v) => setPrice({ basePrice: v })}
                accessibilityLabel={t('basePrice')}
              />
              <FieldError>{err(priceErrors.basePrice)}</FieldError>
            </Field>
            <Field label={t('tiers')} description={t('tiersDescription')}>
              {priceDraft.tiers.map((tier, i) => (
                <View key={i} className="gap-1">
                  <View className="flex-row items-center gap-2">
                    <AffixInput
                      className="flex-1"
                      prefix={t('from')}
                      keyboardType="number-pad"
                      invalid={!!priceErrors.tiers[i]}
                      value={tier.minimumQuantity}
                      onChangeText={(v) => setPrice({ tiers: priceDraft.tiers.map((x, j) => (j === i ? { ...x, minimumQuantity: v } : x)) })}
                      accessibilityLabel={t('tierMinAria', { n: i + 1 })}
                    />
                    <AffixInput
                      className="flex-1"
                      mono
                      suffix={currencySymbol(currency)}
                      keyboardType="decimal-pad"
                      invalid={!!priceErrors.tiers[i]}
                      value={tier.unitPrice}
                      onChangeText={(v) => setPrice({ tiers: priceDraft.tiers.map((x, j) => (j === i ? { ...x, unitPrice: v } : x)) })}
                      accessibilityLabel={t('tierPriceAria', { n: i + 1 })}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('tierRemoveAria', { n: i + 1 })}
                      hitSlop={8}
                      onPress={() => setPrice({ tiers: priceDraft.tiers.filter((_, j) => j !== i) })}>
                      <X size={18} color={c['muted-foreground']} />
                    </Pressable>
                  </View>
                  <FieldError>{err(priceErrors.tiers[i])}</FieldError>
                </View>
              ))}
              <FieldError>{err(priceErrors.form)}</FieldError>
              <Button variant="outline" size="sm" className="self-start" onPress={() => setPrice({ tiers: [...priceDraft.tiers, { minimumQuantity: '', unitPrice: '' }] })}>
                {t('addTier')}
              </Button>
            </Field>
          </FieldGroup>
        </Card>

        <Button loading={saving} disabled={isNew && planLimit} onPress={() => void submit()}>
          {isNew ? t('addProduct') : t('saveChanges')}
        </Button>

        {product ? (
          <>
            <StatusSection productId={product.id} />
            <ProductImageSection productId={product.id} name={draft.name || product.name} />
            <StockSection productId={product.id} />
            <BuyerPrices product={product} />
          </>
        ) : (
          <AppText className="text-sm text-muted-foreground">{t('saveFirst')}</AppText>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ChipField({
  label,
  none,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  none: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Field label={label} description={hint}>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        <Chip role="radio" label={none} selected={!value} onPress={() => onChange('')} />
        {options.map((o) => (
          <Chip key={o.id} role="radio" label={o.name} selected={value === o.id} onPress={() => onChange(o.id)} />
        ))}
      </View>
    </Field>
  );
}

function StatusSection({ productId }: { productId: string }) {
  const t = useT('productEditor');
  const tc = useT('common');
  const errorText = useCatalogueErrorText();
  const product = useProduct(productId).data;
  const command = useProductCommand(productId);
  const featured = useSetFeatured();
  if (!product) return null;

  const run = (cmd: ProductCommand) => {
    const go = () => command.mutate({ command: cmd, expectedRevision: product.revision });
    if (cmd !== 'archive') return go();
    Alert.alert(t('archiveTitle', { name: product.name }), t('archiveDescription'), [
      { text: tc('cancel'), style: 'cancel' },
      { text: t('command.archive'), onPress: go },
    ]);
  };

  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <AppText weight="semibold" className="text-xl text-card-foreground">
          {t('status')}
        </AppText>
        <ProductStateBadge state={product.state} />
      </View>
      <AppText className="text-sm text-muted-foreground">{t(`stateDescription.${product.state}`)}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {productCommands(product.state).map((cmd) => (
          <Button
            key={cmd}
            size="sm"
            variant={cmd === 'activate' ? 'default' : 'outline'}
            loading={command.isPending && command.variables?.command === cmd}
            disabled={command.isPending}
            onPress={() => run(cmd)}>
            {t(`command.${cmd}`)}
          </Button>
        ))}
      </View>
      {product.state === 'INACTIVE' && <AppText className="text-sm text-muted-foreground">{t('activateHint')}</AppText>}
      <CatalogueFormError error={command.error} />
      <SwitchRow
        label={t('featured')}
        description={t('featuredDescription')}
        value={product.featured}
        disabled={featured.isPending}
        onValueChange={(on) => featured.mutate({ product, featured: on }, { onError: (e) => Alert.alert(errorText(e)) })}
      />
    </Card>
  );
}

function BuyerPrices({ product }: { product: Product }) {
  const t = useT('buyerPrices');
  const tmc = useT('mCommon');
  const buyers = useCatalogueBuyers();
  const agreed = useAgreedPrices(buyers.data?.map((b) => b.relationship.id) ?? []);
  const failed = buyers.isError ? buyers : agreed.find((q) => q.isError);
  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      {failed ? (
        <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
      ) : buyers.isPending || agreed.some((q) => q.isPending) ? (
        <LoadingState label={tmc('loadingBuyerPrices')} />
      ) : buyers.data!.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">{t('empty')}</AppText>
      ) : (
        <View className="overflow-hidden rounded-lg border border-border">
          {buyers.data!.map((b, i) => (
            <View key={b.relationship.id}>
              {i > 0 && <View className="h-px bg-border" />}
              <BuyerPriceRow buyer={b} productId={product.id} agreement={agreed[i]?.data?.find((a) => a.productId === product.id)} />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function BuyerPriceRow({ buyer, productId, agreement }: { buyer: CatalogueBuyer; productId: string; agreement: AgreedPrice | undefined }) {
  const t = useT('buyerPrices');
  const errorText = useCatalogueErrorText();
  const { organization } = useBusiness();
  const m = useAgreedPriceMutations(productId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string>();
  const name = buyer.partner?.displayName ?? t('unnamed');
  const relationshipId = buyer.relationship.id;

  const save = () => {
    const price = parsePriceInput(value);
    if (!price) return setProblem(t('priceInvalid'));
    m.set.mutate(
      { relationshipId, body: { unitPrice: price, expectedRevision: agreement?.revision ?? null } },
      { onSuccess: () => setEditing(false), onError: (e) => setProblem(errorText(e)) },
    );
  };

  return (
    <View className="gap-2 p-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-1">
          <AppText className="text-sm text-foreground">{name}</AppText>
          {agreement?.confirmationRequired && <Badge variant="warning">{t('awaitingConfirmation')}</Badge>}
        </View>
        <AppText mono className="text-sm text-foreground">
          {agreement ? formatMoney(agreement.unitPrice, organization.currency) : t('basePrice')}
        </AppText>
      </View>
      {editing ? (
        <View className="flex-row items-start gap-2">
          <View className="flex-1 gap-1">
            <AffixInput
              mono
              suffix={currencySymbol(organization.currency)}
              keyboardType="decimal-pad"
              invalid={!!problem}
              value={value}
              onChangeText={(v) => {
                setValue(v);
                setProblem(undefined);
              }}
              accessibilityLabel={t('editAria', { buyer: name })}
            />
            <FieldError>{problem}</FieldError>
          </View>
          <Button size="sm" loading={m.set.isPending} onPress={save}>
            {t('save')}
          </Button>
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Button
            size="sm"
            variant="outline"
            accessibilityLabel={t('editAria', { buyer: name })}
            onPress={() => {
              setValue(priceToInput(agreement?.unitPrice));
              setProblem(undefined);
              setEditing(true);
            }}>
            {t('edit')}
          </Button>
          {agreement && (
            <Button
              size="sm"
              variant="ghost"
              accessibilityLabel={t('removeAria', { buyer: name })}
              loading={m.remove.isPending}
              onPress={() => m.remove.mutate({ relationshipId, expectedRevision: agreement.revision }, { onError: (e) => Alert.alert(errorText(e)) })}>
              {t('remove')}
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
