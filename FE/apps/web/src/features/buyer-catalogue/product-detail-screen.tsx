"use client";

import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, PackageXIcon, ShoppingCartIcon } from "lucide-react";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  isApiError,
  type Offer,
  type PriceResolution,
} from "@repo/core";
import { EmptyState, ErrorState } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";
import { FavoriteButton, OfferBadges, OfferImage, PriceBlock, QuantityStepper, useAddToCart } from "./offer-parts";
import { useOffer } from "./queries";
import { useVendorContext } from "./vendor-context";

/** Buyer product detail: this buyer's price at the chosen quantity (GET offer ?quantity=), how it is set, tiers, promotions, stock, add to cart. */
export function ProductDetailScreen({ productId }: { productId: string }) {
  const t = useTranslations("product");
  const ts = useTranslations("states");
  const vendor = useVendorContext();
  const vendorId = vendor.active?.vendorId ?? null;
  const base = useOffer(vendorId, productId);

  const notFound = (
    <EmptyState icon={PackageXIcon} title={t("unavailableTitle")} description={t("unavailableDescription")}>
      <Button asChild variant="outline">
        <Link href="/buyer">{t("backToCatalogue")}</Link>
      </Button>
    </EmptyState>
  );

  if (vendor.isPending || (vendorId && base.isPending)) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={ts("loading")}>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (vendor.error) return <ErrorState error={vendor.error} onRetry={() => void vendor.refetch()} />;
  if (!vendorId) return notFound;
  if (base.isError) {
    return isApiError(base.error) && base.error.status === 404 ? notFound : <ErrorState error={base.error} onRetry={() => void base.refetch()} />;
  }
  if (!base.data) return notFound;
  return <Detail key={productId} offer={base.data} />;
}

function Detail({ offer }: { offer: Offer }) {
  const t = useTranslations("product");
  const { product } = offer;
  const min = product.minimumQuantity;
  const [quantity, setQuantity] = useState(min);
  const deferred = useDeferredValue(quantity);
  const priced = useOffer(offer.vendorId, product.id, deferred === min ? undefined : deferred);
  const current = priced.data ?? offer;
  const price = current.effectivePrice;
  const repricing = priced.isFetching || deferred !== quantity;
  const cart = useCart();
  const add = useAddToCart();
  const inCart = cart.quantityOf(product.id);
  const [image, setImage] = useState(0);
  const gallery = product.galleryAssetIds;

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
            {offer.category && ` · ${offer.category.name}`}
            {product.packDescription && ` · ${product.packDescription}`}
          </p>
        </div>
        <FavoriteButton offer={offer} size="icon" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="flex flex-col gap-2">
            <OfferImage
              assetId={gallery[image]}
              alt={t("imageOf", { name: product.name })}
              className="aspect-[4/3] w-full max-w-xl rounded-xl ring-1 ring-foreground/10"
              sizes="(min-width: 1024px) 40vw, 100vw"
            />
            {gallery.length > 1 && (
              <div className="flex gap-2" role="group" aria-label={t("gallery")}>
                {gallery.map((id, i) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={t("showImage", { n: formatNumber(i + 1) })}
                    aria-pressed={i === image}
                    onClick={() => setImage(i)}
                    className={cn("rounded-md ring-2 ring-transparent", i === image && "ring-primary")}
                  >
                    <OfferImage assetId={id} className="size-14" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {(product.description || offer.tags.length > 0) && (
            <Card>
              <CardContent className="flex flex-col gap-3">
                {product.description && <p className="whitespace-pre-line">{product.description}</p>}
                {offer.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1" aria-label={t("tags")}>
                    {offer.tags.map((tag) => (
                      <Badge key={tag.id} variant="outline">
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <PriceBreakdown offer={current} price={price} />
          <Tiers offer={offer} reached={price.reachedTierThreshold} />
          <Promotions offer={current} />
        </div>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardContent className="flex flex-col gap-4">
            <div aria-live="polite" className={cn(repricing && "opacity-60 transition-opacity")}>
              <PriceBlock price={price} currency={offer.currency} unit={offer.unitName} size="lg" />
            </div>
            <OfferBadges offer={current} />
            <p className="text-sm text-muted-foreground">
              {product.quantityStep > 1
                ? t("quantityRule", { min: formatNumber(min), step: formatNumber(product.quantityStep), unit: offer.unitName })
                : t("minimumOrder", { qty: formatNumber(min), unit: offer.unitName })}
            </p>
            <div className="flex items-center justify-between gap-3">
              <QuantityStepper value={quantity} rule={product} onChange={setQuantity} label={t("quantityOf", { product: product.name })} />
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{t("total")}</div>
                <div className={cn("font-mono font-semibold tabular-nums", repricing && "opacity-60")} aria-live="polite">
                  {formatMoney(price.lineTotal, offer.currency)}
                </div>
              </div>
            </div>
            {priced.isError && <p className="text-sm text-destructive">{t("repriceFailed")}</p>}
            <Button onClick={() => add(offer, quantity)}>
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
            <p className="text-xs text-muted-foreground">{t("estimateNote")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** How the backend arrived at the final unit price at this quantity: list → volume → agreed → promotion. */
function PriceBreakdown({ offer, price }: { offer: Offer; price: PriceResolution }) {
  const t = useTranslations("product");
  const money = (amount: string) => formatMoney(amount, offer.currency);
  const rows: { label: string; value: string; strong?: boolean }[] = [{ label: t("baseLabel"), value: money(price.baseUnitPrice) }];
  if (price.reachedTierThreshold !== null) {
    rows.push({ label: t("tierLabel", { qty: formatNumber(price.reachedTierThreshold) }), value: money(price.normalUnitPrice) });
  }
  if (price.agreedUnitPrice !== null) rows.push({ label: t("agreedLabel"), value: money(price.agreedUnitPrice) });
  if (price.appliedPromotion) rows.push({ label: t("promotionLabel", { name: price.appliedPromotion.name }), value: money(price.finalUnitPrice) });
  rows.push({ label: t("finalLabel"), value: money(price.finalUnitPrice), strong: true });
  rows.push({ label: t("lineTotalAt", { qty: formatNumber(offer.pricedQuantity), unit: offer.unitName }), value: money(price.lineTotal), strong: true });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("breakdownTitle")}</CardTitle>
        <CardDescription>{t("breakdownDescription", { unit: offer.unitName })}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3">
              <dt className={r.strong ? "font-medium" : "text-muted-foreground"}>{r.label}</dt>
              <dd className={cn("font-mono tabular-nums", r.strong && "font-semibold")}>{r.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function Tiers({ offer, reached }: { offer: Offer; reached: number | null }) {
  const t = useTranslations("product");
  const tiers = offer.tiers;
  if (tiers.length === 0) return null;
  const min = offer.product.minimumQuantity;
  const money = (amount: string) => formatMoney(amount, offer.currency);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("tiersTitle")}</CardTitle>
        <CardDescription>
          {offer.agreedPrice !== null ? t("agreedOverridesTiers") : t("tiersDescription", { unit: offer.unitName })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>{t("quantity")}</TableHead>
              <TableHead className="text-right">{t("pricePer", { unit: offer.unitName })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {min < tiers[0]!.minimumQuantity && (
              <TableRow data-state={reached === null ? "selected" : undefined}>
                <TableCell>
                  {formatNumber(min)}–{formatNumber(tiers[0]!.minimumQuantity - 1)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{money(offer.basePrice)}</TableCell>
              </TableRow>
            )}
            {tiers.map((tier, i) => {
              const next = tiers[i + 1];
              return (
                <TableRow key={tier.minimumQuantity} data-state={reached === tier.minimumQuantity ? "selected" : undefined}>
                  <TableCell>
                    {next ? `${formatNumber(tier.minimumQuantity)}–${formatNumber(next.minimumQuantity - 1)}` : `${formatNumber(tier.minimumQuantity)}+`}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{money(tier.unitPrice)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Promotions({ offer }: { offer: Offer }) {
  const t = useTranslations("product");
  if (offer.promotions.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("promotionsTitle")}</CardTitle>
        <CardDescription>{t("promotionsDescription", { qty: formatNumber(offer.pricedQuantity) })}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {offer.promotions.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{p.name}</span>
              <span className="flex items-center gap-2">
                <Badge variant="success">
                  {p.kind === "PERCENTAGE"
                    ? t("promotionPercent", { value: formatPercent(p.value) })
                    : t("promotionFixed", { price: formatMoney(p.value, offer.currency), unit: offer.unitName })}
                </Badge>
                <span className="text-muted-foreground">{t("promotionUntil", { date: formatDate(p.endsAt) })}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
