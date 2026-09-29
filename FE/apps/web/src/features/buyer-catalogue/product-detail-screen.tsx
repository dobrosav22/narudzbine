"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PackageXIcon, ShoppingCartIcon } from "lucide-react";
import { defaultQuantity, formatMoney, formatNumber, isServiceError, pickTier, type ProductDetail } from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { EmptyState, ErrorState } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCart } from "@/lib/cart";
import { useSignedIn } from "@/lib/session";
import { useAddToCart } from "./add-to-cart";
import { FavoriteButton } from "./favorite-button";
import { PriceBlock } from "./price-block";
import { QuantityStepper } from "./quantity-stepper";
import { useCategories, useLinePrice, useProductDetail, useTags } from "./queries";

/** 03 → buyer "Product detail": resolved price ("your price"), quantity tiers, favorite, add to cart. */
export function ProductDetailScreen({ productId }: { productId: string }) {
  const t = useTranslations("product");
  const ts = useTranslations("states");
  const { membership, activeVendor } = useSignedIn();
  const scope = { vendorOrgId: activeVendor?.id ?? "", buyerOrgId: membership.org.id };
  const detail = useProductDetail(scope, productId);

  const notFound = (
    <EmptyState icon={PackageXIcon} title={t("unavailableTitle")} description={t("unavailableDescription")}>
      <Button asChild variant="outline">
        <Link href="/buyer">{t("backToCatalogue")}</Link>
      </Button>
    </EmptyState>
  );

  if (!activeVendor) return notFound;
  if (detail.isError) return isServiceError(detail.error, "NOT_FOUND") ? notFound : <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (detail.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={ts("loading")}>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!detail.data) return notFound;
  return <Detail key={productId} scope={scope} detail={detail.data} />;
}

function Detail({ scope, detail }: { scope: { vendorOrgId: string; buyerOrgId: string }; detail: ProductDetail }) {
  const t = useTranslations("product");
  const { product, tiers, tierPrices } = detail;
  const min = defaultQuantity(product);
  const [quantity, setQuantity] = useState(min);
  const line = useLinePrice(scope, product.id, quantity);
  const price = line.data ?? detail.price;
  const cart = useCart();
  const add = useAddToCart();
  const categories = useCategories(scope.vendorOrgId);
  const tags = useTags(scope.vendorOrgId);
  const inCart = cart.quantityOf(product.id);
  const activeTier = pickTier(tiers, quantity);
  const negotiated = detail.price.source === "override";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToCatalogue")}>
          <Link href="/buyer">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{product.sku}</span>
            {product.categoryId && categories.data && ` · ${categories.data.find((c) => c.id === product.categoryId)?.name ?? ""}`}
          </p>
        </div>
        <FavoriteButton productId={product.id} productName={product.name} size="icon" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            className="aspect-[4/3] w-full max-w-xl rounded-xl ring-1 ring-foreground/10"
            sizes="(min-width: 1024px) 40vw, 100vw"
          />
          {(product.description || product.tagIds.length > 0) && (
            <Card>
              <CardContent className="flex flex-col gap-3">
                {product.description && <p>{product.description}</p>}
                {tags.data && product.tagIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.tagIds.map((t) => (
                      <Badge key={t} variant="outline">
                        {tags.data.find((x) => x.id === t)?.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {negotiated ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("negotiatedTitle")}</CardTitle>
                <CardDescription>{t("negotiatedDescription", { price: formatMoney(detail.price.preDiscountUnitPrice), unit: product.unit })}</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            tiers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("tiersTitle")}</CardTitle>
                  <CardDescription>{t("tiersDescription", { unit: product.unit })}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("quantity")}</TableHead>
                        <TableHead className="text-right">{t("pricePer", { unit: product.unit })}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* The base-price row only exists if the minimum order is below the first tier. */}
                      {min < tiers[0]!.minQty && (
                      <TableRow data-state={!activeTier ? "selected" : undefined}>
                        <TableCell>
                          {formatNumber(min)}–{formatNumber(tiers[0]!.minQty - 1)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatMoney(detail.price.unitPrice)}</TableCell>
                      </TableRow>
                      )}
                      {tiers.map((t, i) => {
                        const next = tiers[i + 1];
                        return (
                          <TableRow key={t.id} data-state={activeTier?.id === t.id ? "selected" : undefined}>
                            <TableCell>
                              {next ? `${formatNumber(t.minQty)}–${formatNumber(next.minQty - 1)}` : `${formatNumber(t.minQty)}+`}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{formatMoney(tierPrices[i]!.unitPrice)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          )}
        </div>

        <Card className="h-fit">
          <CardContent className="flex flex-col gap-4">
            <PriceBlock price={price} unit={product.unit} size="lg" />
            <div className="flex flex-wrap gap-1">
              {min > 1 && <Badge variant="outline">{t("minimumOrder", { qty: formatNumber(min) })}</Badge>}
              {product.stock === 0 && <Badge variant="destructive">{t("outOfStock")}</Badge>}
            </div>
            <div className="flex items-center justify-between gap-3">
              <QuantityStepper value={quantity} min={min} onChange={setQuantity} label={t("quantityOf", { product: product.name })} />
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{t("total")}</div>
                <div className="font-mono font-semibold tabular-nums" aria-live="polite">
                  {formatMoney(price.lineTotal)}
                </div>
              </div>
            </div>
            <Button onClick={() => add(product, quantity)}>
              <ShoppingCartIcon data-icon="inline-start" />
              {t("addToCart")}
            </Button>
            {inCart > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                {t.rich("alreadyInCart", {
                  qty: formatNumber(inCart),
                  cart: (chunks) => (
                    <Link href="/buyer/cart" className="text-primary underline-offset-4 hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
