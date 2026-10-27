"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, PackageXIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  catalogueQueries,
  currencySymbol,
  emptyProductDraft,
  fieldProblemMsg,
  isApiError,
  pricingToDraft,
  pricingUnchanged,
  productFieldsUnchanged,
  productLimitReached,
  productToDraft,
  sameCatalogueFields,
  updatePricing,
  uuidv7,
  validatePricingDraft,
  validateProductDraft,
  type Msg,
  type NamedResource,
  type Pricing,
  type PricingDraft,
  type PricingErrors,
  type Product,
  type ProductDraft,
  type ProductDraftErrors,
  type Unit,
} from "@repo/core";
import { EmptyState, ErrorState } from "@/components/query-states";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMsg } from "@/lib/i18n";
import { useBusiness } from "@/lib/session";
import { BuyerPricesCard } from "./buyer-prices-card";
import { GalleryCard } from "./gallery-card";
import { CatalogueFormError, PlanLimitAlert } from "./parts";
import { StatusCard } from "./status-card";
import { StockCard } from "./stock-panel";
import { useCreateProduct, usePlanUsage, usePricing, useProduct, useTaxonomy, useUpdatePricing, useUpdateProduct } from "./queries";

const NONE = "none";

/** Product detail/edit. `productId` undefined = new product (created INACTIVE, then priced). */
export function ProductEditor({ productId }: { productId?: string }) {
  const t = useTranslations("productEditor");
  const product = useProduct(productId);
  const pricing = usePricing(productId);
  const units = useTaxonomy("units");
  const categories = useTaxonomy("categories");
  const tags = useTaxonomy("tags");
  const queries = productId ? [product, pricing, units, categories, tags] : [units, categories, tags];

  if (productId && isApiError(product.error, "NOT_FOUND")) {
    return (
      <EmptyState icon={PackageXIcon} title={t("notFoundTitle")} description={t("notFoundDescription")}>
        <Button asChild variant="outline">
          <Link href="/vendor/catalogue">{t("backToCatalogue")}</Link>
        </Button>
      </EmptyState>
    );
  }
  const failed = queries.find((q) => q.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />;
  if (queries.some((q) => q.isPending)) return <EditorSkeleton />;

  return (
    <ProductForm
      key={productId ?? "new"}
      product={product.data}
      pricing={pricing.data}
      units={units.data!}
      categories={categories.data!}
      tags={tags.data!}
    />
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
  const t = useTranslations("productEditor");
  const tm = useMsg();
  const router = useRouter();
  const qc = useQueryClient();
  const { organization } = useBusiness();
  const currency = organization.currency;
  const isNew = !product;
  // Baselines are what the form started from; the query data may move on (status/featured/gallery edits).
  const [baseline, setBaseline] = useState({ product, pricing });
  const [draft, setDraft] = useState<ProductDraft>(() => (product ? productToDraft(product) : emptyProductDraft()));
  const [priceDraft, setPriceDraft] = useState<PricingDraft>(() => pricingToDraft(pricing));
  const [errors, setErrors] = useState<ProductDraftErrors>({});
  const [priceErrors, setPriceErrors] = useState<PricingErrors>({ tiers: [] });
  const [createId] = useState(() => uuidv7()); // one creation intent per open "new" form
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? "");
  const savePricing = useUpdatePricing(product?.id ?? "");
  const plan = usePlanUsage();
  const [saving, setSaving] = useState(false);
  const error = create.error ?? update.error ?? savePricing.error;
  const conflict = isApiError(error, "REVISION_CONFLICT");
  const planLimit = isApiError(error, "PLAN_LIMIT_EXCEEDED") || (isNew && productLimitReached(plan.data));
  const frozen = !!product?.unitAndPackFrozen;
  const err = (m: Msg | undefined) => (m ? tm(m) : undefined);
  const serverField = (path: string) => {
    const code = isApiError(error) ? error.fieldCode(path) : undefined;
    const m = fieldProblemMsg(code);
    return m ? tm(m) : undefined;
  };

  const resetErrors = () => {
    create.reset();
    update.reset();
    savePricing.reset();
  };
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (error && !conflict) resetErrors();
  };
  const setPrice = (patch: Partial<PricingDraft>) => {
    setPriceDraft((d) => ({ ...d, ...patch }));
    setPriceErrors({ tiers: [] });
    if (error && !conflict) resetErrors();
  };
  const setTier = (i: number, patch: Partial<PricingDraft["tiers"][number]>) =>
    setPrice({ tiers: priceDraft.tiers.map((tier, j) => (j === i ? { ...tier, ...patch } : tier)) });

  /** Replace the form with the latest server state (after a conflict, or Discard). */
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
    setErrors({});
    setPriceErrors({ tiers: [] });
  };

  const onSubmit = async () => {
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
            const saved = await updatePricing(created.id, { expectedRevision: current.revision, ...prices.value, deactivateProduct: false });
            qc.setQueryData(catalogueQueries.pricing(created.id).queryKey, saved);
          } catch {
            toast.error(t("createdWithoutPrice"));
          }
        }
        toast.success(t("created", { name: created.name }));
        router.replace(`/vendor/catalogue/${created.id}`);
        return;
      }
      const latest = qc.getQueryData<Product>(catalogueQueries.product(product.id).queryKey) ?? product;
      const latestPricing = qc.getQueryData<Pricing>(catalogueQueries.pricing(product.id).queryKey) ?? baseline.pricing;
      const base = baseline.product!;
      const detailsChanged = !productFieldsUnchanged(base, fields.value);
      const pricingChanged = !pricingUnchanged(baseline.pricing, prices.value);
      if (!detailsChanged && !pricingChanged) {
        toast.message(t("nothingChanged"));
        return;
      }
      // Use the newest token only when nothing we edit changed elsewhere; otherwise the stale baseline conflicts.
      const productRevision = sameCatalogueFields(base, latest) ? latest.revision : base.revision;
      const pricingRevision =
        latestPricing && baseline.pricing && pricingUnchanged(latestPricing, { basePrice: baseline.pricing.basePrice, tiers: baseline.pricing.tiers })
          ? latestPricing.revision
          : baseline.pricing!.revision;
      const correction = pricingChanged ? { expectedRevision: pricingRevision, ...prices.value, deactivateProduct: false } : null;
      if (detailsChanged) {
        const saved = await update.mutateAsync({ expectedRevision: productRevision, ...fields.value, pricingCorrection: correction });
        const freshPricing = correction ? await qc.fetchQuery({ ...catalogueQueries.pricing(product.id), staleTime: 0 }) : latestPricing;
        setBaseline({ product: saved, pricing: freshPricing });
      } else {
        const saved = await savePricing.mutateAsync(correction!);
        setBaseline((b) => ({ ...b, pricing: saved }));
      }
      toast.success(t("saved"));
    } catch {
      // Shown from the mutation error state.
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToCatalogue")}>
          <Link href="/vendor/catalogue">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{isNew ? t("newTitle") : baseline.product!.name}</h1>
          {!isNew && <p className="font-mono text-xs text-muted-foreground">{baseline.product!.sku}</p>}
        </div>
        {!isNew && (
          <Button type="button" variant="outline" disabled={saving} onClick={() => void reload()}>
            {t("discard")}
          </Button>
        )}
        <Button type="submit" disabled={saving || (isNew && planLimit)}>
          {saving && <Spinner data-icon="inline-start" />}
          {isNew ? t("addProduct") : t("saveChanges")}
        </Button>
      </div>

      {planLimit && <PlanLimitAlert plan={plan.data} />}
      {conflict ? (
        <Alert variant="destructive">
          <AlertDescription>{t("conflict")}</AlertDescription>
          <AlertAction>
            <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
              <RotateCcwIcon data-icon="inline-start" />
              {t("reload")}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        !planLimit && <CatalogueFormError error={error} />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!(errors.name || serverField("name")) || undefined}>
                  <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
                  <Input id="name" value={draft.name} maxLength={200} onChange={(e) => set("name", e.target.value)} />
                  <FieldError>{err(errors.name) ?? serverField("name")}</FieldError>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!(errors.sku || serverField("sku") || isApiError(error, "SKU_RESERVED")) || undefined}>
                    <FieldLabel htmlFor="sku">{t("sku")}</FieldLabel>
                    <Input id="sku" className="font-mono" value={draft.sku} maxLength={64} autoComplete="off" onChange={(e) => set("sku", e.target.value)} />
                    {errors.sku || serverField("sku") ? <FieldError>{err(errors.sku) ?? serverField("sku")}</FieldError> : <FieldDescription>{t("skuHint")}</FieldDescription>}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="category">{t("category")}</FieldLabel>
                    <Select value={draft.categoryId || NONE} onValueChange={(v) => set("categoryId", v === NONE ? "" : v)}>
                      <SelectTrigger id="category" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={NONE}>{t("noCategory")}</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field data-invalid={!!errors.description || undefined}>
                  <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
                  <Textarea id="description" rows={3} value={draft.description} maxLength={5000} onChange={(e) => set("description", e.target.value)} />
                  <FieldError>{err(errors.description)}</FieldError>
                </Field>
                {tags.length > 0 && (
                  <Field data-invalid={!!errors.tagIds || undefined}>
                    <FieldLabel id="tags-label">{t("tags")}</FieldLabel>
                    <ToggleGroup
                      type="multiple"
                      variant="outline"
                      size="sm"
                      spacing={2}
                      className="flex-wrap"
                      aria-labelledby="tags-label"
                      value={draft.tagIds}
                      onValueChange={(v) => set("tagIds", v)}
                    >
                      {tags.map((tag) => (
                        <ToggleGroupItem key={tag.id} value={tag.id}>
                          {tag.name}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <FieldError>{err(errors.tagIds)}</FieldError>
                  </Field>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="unit">{t("unit")}</FieldLabel>
                    <Select value={draft.unitId || NONE} disabled={frozen} onValueChange={(v) => set("unitId", v === NONE ? "" : v)}>
                      <SelectTrigger id="unit" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={NONE}>{t("noUnit")}</SelectItem>
                          {units.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>{frozen ? t("frozen") : t("unitHint")}</FieldDescription>
                  </Field>
                  <Field data-invalid={!!errors.packDescription || undefined}>
                    <FieldLabel htmlFor="pack">{t("pack")}</FieldLabel>
                    <Input
                      id="pack"
                      value={draft.packDescription}
                      maxLength={200}
                      disabled={frozen}
                      placeholder={t("packPlaceholder")}
                      onChange={(e) => set("packDescription", e.target.value)}
                    />
                    <FieldError>{err(errors.packDescription)}</FieldError>
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!errors.minimumQuantity || undefined}>
                    <FieldLabel htmlFor="minimum">{t("minimumQuantity")}</FieldLabel>
                    <Input id="minimum" inputMode="numeric" className="font-mono" value={draft.minimumQuantity} onChange={(e) => set("minimumQuantity", e.target.value)} />
                    <FieldError>{err(errors.minimumQuantity)}</FieldError>
                  </Field>
                  <Field data-invalid={!!errors.quantityStep || undefined}>
                    <FieldLabel htmlFor="step">{t("quantityStep")}</FieldLabel>
                    <Input id="step" inputMode="numeric" className="font-mono" value={draft.quantityStep} onChange={(e) => set("quantityStep", e.target.value)} />
                    <FieldError>{err(errors.quantityStep)}</FieldError>
                  </Field>
                </div>
                <FieldDescription>{t("quantityHint")}</FieldDescription>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("pricing")}</CardTitle>
              <CardDescription>{t("pricingDescription", { currency })}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!priceErrors.basePrice || undefined} className="sm:max-w-56">
                  <FieldLabel htmlFor="basePrice">{t("basePrice")}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="basePrice"
                      inputMode="decimal"
                      className="font-mono"
                      placeholder="0,00"
                      value={priceDraft.basePrice}
                      aria-invalid={!!priceErrors.basePrice || undefined}
                      onChange={(e) => setPrice({ basePrice: e.target.value })}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>{currencySymbol(currency)}</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {priceErrors.basePrice ? <FieldError>{err(priceErrors.basePrice)}</FieldError> : <FieldDescription>{t("basePriceHint")}</FieldDescription>}
                </Field>

                <Field data-invalid={!!priceErrors.form || undefined}>
                  <FieldTitle>{t("tiers")}</FieldTitle>
                  <FieldDescription>{t("tiersDescription")}</FieldDescription>
                  {priceDraft.tiers.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {priceDraft.tiers.map((tier, i) => (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <InputGroup className="w-36">
                              <InputGroupAddon>
                                <InputGroupText>{t("from")}</InputGroupText>
                              </InputGroupAddon>
                              <InputGroupInput
                                inputMode="numeric"
                                aria-label={t("tierMinAria", { n: i + 1 })}
                                aria-invalid={!!priceErrors.tiers[i] || undefined}
                                value={tier.minimumQuantity}
                                onChange={(e) => setTier(i, { minimumQuantity: e.target.value })}
                              />
                            </InputGroup>
                            <InputGroup className="w-40">
                              <InputGroupInput
                                inputMode="decimal"
                                className="font-mono"
                                aria-label={t("tierPriceAria", { n: i + 1 })}
                                aria-invalid={!!priceErrors.tiers[i] || undefined}
                                value={tier.unitPrice}
                                onChange={(e) => setTier(i, { unitPrice: e.target.value })}
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>{currencySymbol(currency)}</InputGroupText>
                              </InputGroupAddon>
                            </InputGroup>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("tierRemoveAria", { n: i + 1 })}
                              onClick={() => setPrice({ tiers: priceDraft.tiers.filter((_, j) => j !== i) })}
                            >
                              <XIcon />
                            </Button>
                          </div>
                          {priceErrors.tiers[i] && <FieldError>{err(priceErrors.tiers[i])}</FieldError>}
                        </div>
                      ))}
                    </div>
                  )}
                  <FieldError>{err(priceErrors.form)}</FieldError>
                  <div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPrice({ tiers: [...priceDraft.tiers, { minimumQuantity: "", unitPrice: "" }] })}>
                      <PlusIcon data-icon="inline-start" />
                      {t("addTier")}
                    </Button>
                  </div>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          {product && <BuyerPricesCard product={product} />}
        </div>

        <div className="flex flex-col gap-6">
          {product ? (
            <>
              <StatusCard productId={product.id} />
              <GalleryCard productId={product.id} name={draft.name || product.name} />
              <StockCard productId={product.id} unitName={units.find((u) => u.id === product.unitId)?.name} />
            </>
          ) : (
            <Alert>
              <AlertDescription>{t("saveFirst")}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </form>
  );
}

function EditorSkeleton() {
  const t = useTranslations("states");
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label={t("loading")}>
      <Skeleton className="h-9 w-1/3" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
