"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { formatNumber, type Product } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ProductStateBadge, ProductThumb, useCatalogueErrorText } from "@/features/vendor-catalogue/parts";
import { useAllProducts, useProducts, useSetFeatured } from "@/features/vendor-catalogue/queries";
import { CatalogueNav } from "./catalogue-nav";

/**
 * Featured products: a per-product flag (PUT …/featured with the product revision). The vendor
 * product list has no featured filter, so the featured set is read from all products.
 */
export function FeaturedScreen() {
  const t = useTranslations("merch.featured");
  const all = useAllProducts();
  const featured = (all.data ?? []).filter((p) => p.featured);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <CatalogueNav />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("count", { count: featured.length, countText: formatNumber(featured.length) })}</CardTitle>
            <CardDescription>{t("orderNote")}</CardDescription>
          </CardHeader>
          <CardContent>
            {all.isError ? (
              <ErrorState error={all.error} onRetry={() => void all.refetch()} />
            ) : all.isPending ? (
              <RowsSkeleton rows={4} />
            ) : featured.length === 0 ? (
              <EmptyState icon={SparklesIcon} title={t("emptyTitle")} description={t("emptyDescription")} />
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {featured.map((p) => (
                  <FeaturedRow key={p.id} product={p} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <FeatureSearch />
      </div>
    </div>
  );
}

function FeaturedRow({ product }: { product: Product }) {
  const t = useTranslations("merch.featured");
  const errorText = useCatalogueErrorText();
  const setFeatured = useSetFeatured();
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <ProductThumb assetId={product.galleryAssetIds[0]} className="size-10" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={`/vendor/catalogue/${product.id}`} className="truncate font-medium hover:underline">
          {product.name}
        </Link>
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono">{product.sku}</span>
          {product.state !== "ACTIVE" && <Badge variant="warning">{t("hidden")}</Badge>}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("unfeatureAria", { name: product.name })}
        disabled={setFeatured.isPending}
        onClick={() =>
          setFeatured.mutate(
            { product, featured: false },
            { onSuccess: () => toast.success(t("featuredOff", { name: product.name })), onError: (e) => toast.error(errorText(e)) },
          )
        }
      >
        <XIcon />
      </Button>
    </li>
  );
}

function FeatureSearch() {
  const t = useTranslations("merch.featured");
  const errorText = useCatalogueErrorText();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const results = useProducts({ page: 0, size: 10, ...(q ? { q } : {}) });
  const setFeatured = useSetFeatured();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("addTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchAria")} />
        </InputGroup>
        {results.isError ? (
          <ErrorState error={results.error} onRetry={() => void results.refetch()} />
        ) : results.isPending ? (
          <RowsSkeleton rows={4} />
        ) : results.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noResults")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {results.data.items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono">{p.sku}</span>
                    <ProductStateBadge state={p.state} />
                  </span>
                </div>
                {p.featured ? (
                  <Badge variant="info">{t("alreadyFeatured")}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={t("featureAria", { name: p.name })}
                    disabled={setFeatured.isPending}
                    onClick={() =>
                      setFeatured.mutate(
                        { product: p, featured: true },
                        { onSuccess: () => toast.success(t("featuredOn", { name: p.name })), onError: (e) => toast.error(errorText(e)) },
                      )
                    }
                  >
                    {t("feature")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
