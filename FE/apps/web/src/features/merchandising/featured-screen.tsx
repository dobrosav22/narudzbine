"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { FEATURED_SUGGESTED_MAX, formatMoney, formatNumber, moveItem, type Product } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "@/features/auth/form-error";
import { useVendorProducts } from "@/features/vendor-catalogue/queries";
import { CatalogueNav } from "./catalogue-nav";
import { useFeatured, useSetFeatured } from "./queries";
import { useTranslations } from "next-intl";

/**
 * 03 → "Featured & Promotions", featured half: the manually ordered list buyers see
 * as the first shelf on their home screen (01 §4). Edits are a local draft saved in
 * one call — setFeatured replaces the whole list, so quick reorders can't race.
 */
export function FeaturedScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("merch.featured");
  const tc = useTranslations("common");
  const featured = useFeatured(vendorOrgId);
  const products = useVendorProducts({ vendorOrgId, search: "", tagIds: [] });
  const save = useSetFeatured(vendorOrgId);
  const [draft, setDraft] = useState<string[] | null>(null);

  const saved = featured.data?.map((f) => f.productId) ?? [];
  const ids = draft ?? saved;
  const dirty = draft !== null && draft.join() !== saved.join();
  const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
  const addable = (products.data ?? []).filter((p) => p.isActive && !ids.includes(p.id));

  const edit = (next: string[]) => {
    if (save.error) save.reset();
    setDraft(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <CatalogueNav />

      {featured.isError || products.isError ? (
        <ErrorState
          error={featured.error ?? products.error}
          onRetry={() => void Promise.all([featured.refetch(), products.refetch()])}
        />
      ) : featured.isPending || products.isPending ? (
        <RowsSkeleton rows={5} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>
              {ids.length ? t("count", { count: formatNumber(ids.length) }) : t("none")}
            </CardDescription>
            <CardAction>
              <Select
                value=""
                onValueChange={(id) => edit([...ids, id])}
                disabled={addable.length === 0}
              >
                <SelectTrigger className="w-56" aria-label={t("addAria")}>
                  <SelectValue placeholder={addable.length ? t("addPlaceholder") : t("allFeatured")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {addable.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {ids.length === 0 ? (
              <EmptyState
                icon={SparklesIcon}
                title={t("emptyTitle")}
                description={t("emptyDescription")}
              />
            ) : (
              <ol aria-label={t("listAria")} className="flex flex-col divide-y rounded-lg border">
                {ids.map((id, i) => (
                  <FeaturedRow
                    key={id}
                    position={i + 1}
                    product={byId.get(id)}
                    isFirst={i === 0}
                    isLast={i === ids.length - 1}
                    onMove={(delta) => edit(moveItem(ids, i, delta))}
                    onRemove={() => edit(ids.filter((x) => x !== id))}
                  />
                ))}
              </ol>
            )}

            {ids.length > FEATURED_SUGGESTED_MAX && (
              <Alert>
                <SparklesIcon />
                <AlertTitle>{t("longTitle")}</AlertTitle>
                <AlertDescription>{t("longDescription", { count: formatNumber(FEATURED_SUGGESTED_MAX) })}</AlertDescription>
              </Alert>
            )}
            {save.error && <FormError error={save.error} />}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty && <span className="mr-auto text-sm text-muted-foreground">{t("unsaved")}</span>}
              <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => setDraft(null)}>
                {tc("discard")}
              </Button>
              <Button
                disabled={!dirty || save.isPending}
                onClick={() =>
                  save.mutate(ids, {
                    onSuccess: () => {
                      setDraft(null);
                      toast.success(t("saved"));
                    },
                  })
                }
              >
                {save.isPending && <Spinner data-icon="inline-start" />}
                {t("save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FeaturedRow({
  position,
  product,
  isFirst,
  isLast,
  onMove,
  onRemove,
}: {
  position: number;
  product: Product | undefined;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("merch.featured");
  const name = product?.name ?? t("deletedProduct");
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="w-6 text-right font-mono text-sm text-muted-foreground tabular-nums">{position}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        {product ? (
          <Link href={`/vendor/catalogue/${product.id}`} className="truncate font-medium hover:underline">
            {name}
          </Link>
        ) : (
          <span className="font-medium">{name}</span>
        )}
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {product && <span className="font-mono">{product.sku}</span>}
          {product && <span className="font-mono tabular-nums">{formatMoney(product.basePrice)}</span>}
          {/* Buyers only ever see active products, so an inactive one silently drops off the shelf. */}
          {(!product || !product.isActive) && <Badge variant="warning">{t("hidden")}</Badge>}
        </span>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon-sm" aria-label={t("moveUp", { name })} disabled={isFirst} onClick={() => onMove(-1)}>
          <ArrowUpIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t("moveDown", { name })} disabled={isLast} onClick={() => onMove(1)}>
          <ArrowDownIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t("remove", { name })} onClick={onRemove}>
          <XIcon />
        </Button>
      </div>
    </li>
  );
}
