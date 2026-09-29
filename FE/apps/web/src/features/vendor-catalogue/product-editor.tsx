"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, PackageXIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  currencySymbol,
  emptyProductDraft,
  isAtLimit,
  isServiceError,
  parseDecimal,
  productToDraft,
  tiersToDrafts,
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
} from "@repo/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState, ErrorState } from "@/components/query-states";
import { FormError } from "@/features/auth/form-error";
import { PlanLimitNotice } from "@/features/subscription/plan-limit";
import { BuyerPricesCard } from "./buyer-prices-card";
import { ProductImageCard } from "./product-image-card";
import {
  useCategories,
  useDeleteProduct,
  usePriceTiers,
  useProduct,
  useSaveProduct,
  useVendorPlan,
  useTags,
  useVendorOrg,
} from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText, useMsg } from "@/lib/i18n";

const NO_CATEGORY = "none";

/** 03 → "Product detail/edit". `productId` undefined = new product. */
export function ProductEditor({ vendorOrgId, productId }: { vendorOrgId: string; productId?: string }) {
  const t = useTranslations("productEditor");
  const org = useVendorOrg(vendorOrgId);
  const categories = useCategories(vendorOrgId);
  const tags = useTags(vendorOrgId);
  const usage = useVendorPlan(vendorOrgId);
  const product = useProduct(productId);
  const tiers = usePriceTiers(productId);

  const queries = productId ? [org, categories, tags, usage, product, tiers] : [org, categories, tags, usage];
  const failed = queries.find((q) => q.isError);

  if (productId && isServiceError(product.error, "NOT_FOUND")) {
    return (
      <EmptyState icon={PackageXIcon} title={t("notFoundTitle")} description={t("notFoundDescription")}>
        <Button asChild variant="outline">
          <Link href="/vendor/catalogue">{t("backToCatalogue")}</Link>
        </Button>
      </EmptyState>
    );
  }
  if (failed) return <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />;
  if (queries.some((q) => q.isPending)) return <EditorSkeleton />;

  return (
    <ProductForm
      // Remount on a different product so the form re-initialises from fresh data.
      key={productId ?? "new"}
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
  const t = useTranslations("productEditor");
  const tm = useMsg();
  const errorText = useErrorText();
  const router = useRouter();
  const isNew = !product;
  const [draft, setDraft] = useState<ProductDraft>(() => (product ? productToDraft(product) : emptyProductDraft()));
  const [tierDrafts, setTierDrafts] = useState<TierDraft[]>(() => tiersToDrafts(tiers));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [tierErrors, setTierErrors] = useState<(Msg | undefined)[]>([]);
  const save = useSaveProduct(vendorOrgId);
  const remove = useDeleteProduct(vendorOrgId);
  const atLimit = isNew && isAtLimit(usage, "products");
  const planLimitHit = atLimit || isServiceError(save.error, "PLAN_LIMIT");
  // A taken SKU belongs on the SKU field, not in a banner.
  const skuConflict = isServiceError(save.error, "CONFLICT") ? errorText(save.error) : undefined;
  const err = (m: Msg | undefined) => (m ? tm(m) : undefined);

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setTier = (i: number, patch: Partial<TierDraft>) => {
    setTierDrafts((ts) => ts.map((tier, j) => (j === i ? { ...tier, ...patch } : tier)));
    setTierErrors((es) => es.map((e, j) => (j === i ? undefined : e)));
  };

  const onSubmit = () => {
    const result = validateProductDraft(draft, { tracksInventory: org.tracksInventory });
    const tierResult = validateTierDrafts(tierDrafts, parseDecimal(draft.basePrice));
    setErrors(result.ok ? {} : result.errors);
    setTierErrors(tierResult.ok ? [] : tierResult.errors);
    if (!result.ok || !tierResult.ok) return;
    save.mutate(
      { productId: product?.id, values: result.value, tiers: tierResult.value },
      {
        onSuccess: (saved) => {
          toast.success(isNew ? t("added", { name: saved.name }) : t("saved"));
          if (isNew) router.replace(`/vendor/catalogue/${saved.id}`);
        },
      },
    );
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToCatalogue")}>
          <Link href="/vendor/catalogue">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{isNew ? t("newTitle") : product.name}</h1>
          {!isNew && <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>}
        </div>
        {!isNew && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive">
                <Trash2Icon data-icon="inline-start" />
                {t("delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteTitle", { name: product.name })}</AlertDialogTitle>
                <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    remove.mutate(product.id, {
                      onSuccess: () => {
                        toast.success(t("deleted", { name: product.name }));
                        router.push("/vendor/catalogue");
                      },
                      onError: (e) => toast.error(errorText(e)),
                    })
                  }
                >
                  {t("deleteProduct")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <Button type="submit" disabled={save.isPending || atLimit}>
          {save.isPending && <Spinner data-icon="inline-start" />}
          {isNew ? t("addProduct") : t("saveChanges")}
        </Button>
      </div>

      {planLimitHit && <PlanLimitNotice plan={usage} limit="products" />}
      {save.error && !planLimitHit && !skuConflict && <FormError error={save.error} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!errors.name || undefined}>
                  <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
                  <Input id="name" value={draft.name} aria-invalid={!!errors.name || undefined} onChange={(e) => set("name", e.target.value)} />
                  <FieldError>{err(errors.name)}</FieldError>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!(errors.sku || skuConflict) || undefined}>
                    <FieldLabel htmlFor="sku">{t("sku")}</FieldLabel>
                    <Input
                      id="sku"
                      className="font-mono"
                      value={draft.sku}
                      aria-invalid={!!(errors.sku || skuConflict) || undefined}
                      onChange={(e) => {
                        set("sku", e.target.value);
                        if (skuConflict) save.reset();
                      }}
                    />
                    <FieldError>{err(errors.sku) ?? skuConflict}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="category">{t("category")}</FieldLabel>
                    <Select value={draft.categoryId || NO_CATEGORY} onValueChange={(v) => set("categoryId", v === NO_CATEGORY ? "" : v)}>
                      <SelectTrigger id="category" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={NO_CATEGORY}>{t("noCategory")}</SelectItem>
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
                <Field>
                  <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
                  <Textarea id="description" rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} />
                </Field>
                {tags.length > 0 && (
                  <Field>
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
                  </Field>
                )}
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("pricing")}</CardTitle>
              <CardDescription>{t("pricingDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field data-invalid={!!errors.basePrice || undefined}>
                    <FieldLabel htmlFor="basePrice">{t("basePrice")}</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="basePrice"
                        inputMode="decimal"
                        className="font-mono"
                        placeholder="0,00"
                        value={draft.basePrice}
                        aria-invalid={!!errors.basePrice || undefined}
                        onChange={(e) => set("basePrice", e.target.value)}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{currencySymbol()}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldError>{err(errors.basePrice)}</FieldError>
                  </Field>
                  <Field data-invalid={!!errors.unit || undefined}>
                    <FieldLabel htmlFor="unit">{t("unit")}</FieldLabel>
                    <Input id="unit" placeholder={t("unitPlaceholder")} value={draft.unit} aria-invalid={!!errors.unit || undefined} onChange={(e) => set("unit", e.target.value)} />
                    <FieldError>{err(errors.unit)}</FieldError>
                  </Field>
                  <Field data-invalid={!!errors.minOrderQuantity || undefined}>
                    <FieldLabel htmlFor="moq">{t("minimumOrder")}</FieldLabel>
                    <Input
                      id="moq"
                      inputMode="numeric"
                      placeholder={t("none")}
                      value={draft.minOrderQuantity}
                      aria-invalid={!!errors.minOrderQuantity || undefined}
                      onChange={(e) => set("minOrderQuantity", e.target.value)}
                    />
                    <FieldError>{err(errors.minOrderQuantity)}</FieldError>
                  </Field>
                </div>

                <Field>
                  <FieldTitle>{t("tiers")}</FieldTitle>
                  <FieldDescription>{t("tiersDescription")}</FieldDescription>
                  {tierDrafts.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {tierDrafts.map((tier, i) => (
                        <div key={i} className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <InputGroup className="w-36">
                              <InputGroupAddon>
                                <InputGroupText>{t("from")}</InputGroupText>
                              </InputGroupAddon>
                              <InputGroupInput
                                inputMode="numeric"
                                aria-label={t("tierMinAria", { n: i + 1 })}
                                aria-invalid={!!tierErrors[i] || undefined}
                                value={tier.minQty}
                                onChange={(e) => setTier(i, { minQty: e.target.value })}
                              />
                            </InputGroup>
                            <InputGroup className="w-40">
                              <InputGroupInput
                                inputMode="decimal"
                                className="font-mono"
                                aria-label={t("tierPriceAria", { n: i + 1 })}
                                aria-invalid={!!tierErrors[i] || undefined}
                                value={tier.pricePerUnit}
                                onChange={(e) => setTier(i, { pricePerUnit: e.target.value })}
                              />
                              <InputGroupAddon align="inline-end">
                                <InputGroupText>{currencySymbol()}</InputGroupText>
                              </InputGroupAddon>
                            </InputGroup>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("tierRemoveAria", { n: i + 1 })}
                              onClick={() => {
                                setTierDrafts((ts) => ts.filter((_, j) => j !== i));
                                setTierErrors((es) => es.filter((_, j) => j !== i));
                              }}
                            >
                              <XIcon />
                            </Button>
                          </div>
                          {tierErrors[i] && <FieldError>{err(tierErrors[i])}</FieldError>}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Wrapped: a vertical Field stretches its direct children to full width. */}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTierDrafts((ts) => [...ts, { minQty: "", pricePerUnit: "" }])}
                    >
                      <PlusIcon data-icon="inline-start" />
                      {t("addTier")}
                    </Button>
                  </div>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          {!isNew && <BuyerPricesCard vendorOrgId={vendorOrgId} product={product} />}
        </div>

        <div className="flex flex-col gap-6">
          <ProductImageCard vendorOrgId={vendorOrgId} productName={draft.name} value={draft.imageUrl} onChange={(url) => set("imageUrl", url)} />

          <Card>
            <CardHeader>
              <CardTitle>{t("status")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="isActive">{t("active")}</FieldLabel>
                  <FieldDescription>{t("activeDescription")}</FieldDescription>
                </FieldContent>
                <Switch id="isActive" checked={draft.isActive} onCheckedChange={(v) => set("isActive", v)} />
              </Field>
            </CardContent>
          </Card>

          {/* 01 §3: inventory is optional per vendor — no stock UI at all when not tracked. */}
          {org.tracksInventory && (
            <Card>
              <CardHeader>
                <CardTitle>{t("inventory")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Field data-invalid={!!errors.stock || undefined}>
                  <FieldLabel htmlFor="stock">{t("inStock")}</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="stock"
                      inputMode="numeric"
                      className="font-mono"
                      placeholder="0"
                      value={draft.stock}
                      aria-invalid={!!errors.stock || undefined}
                      onChange={(e) => set("stock", e.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>{draft.unit || t("units")}</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldError>{err(errors.stock)}</FieldError>
                </Field>
              </CardContent>
            </Card>
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
