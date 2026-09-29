"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatNumber, type CatalogueItem } from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardAction, CardDescription } from "@/components/ui/card";
import { QuickAddButton } from "./add-to-cart";
import { FavoriteButton } from "./favorite-button";
import { PriceBlock } from "./price-block";

export function ProductCard({ item, extra }: { item: CatalogueItem; extra?: string }) {
  const t = useTranslations("catalogue");
  const { product, price } = item;
  return (
    <Card size="sm" className="h-full pt-0">
      <Link href={`/buyer/products/${product.id}`} tabIndex={-1} aria-hidden>
        <ProductImage
          src={product.imageUrl}
          className="aspect-[4/3] w-full rounded-none"
          sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
        />
      </Link>
      <CardHeader>
        <CardTitle className="leading-snug">
          <Link href={`/buyer/products/${product.id}`} className="hover:underline">
            {product.name}
          </Link>
        </CardTitle>
        <CardDescription className="font-mono text-xs">{product.sku}</CardDescription>
        <CardAction>
          <FavoriteButton productId={product.id} productName={product.name} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <PriceBlock price={price} unit={product.unit} />
        <div className="flex flex-wrap gap-1">
          {product.minOrderQuantity && product.minOrderQuantity > 1 && (
            <Badge variant="outline">{t("minShort", { qty: formatNumber(product.minOrderQuantity) })}</Badge>
          )}
          {/* Stock is informational only — ordering is never blocked on it [assumed] (BUILD_LOG). */}
          {product.stock === 0 && <Badge variant="destructive">{t("outOfStock")}</Badge>}
          {extra && <Badge variant="secondary">{extra}</Badge>}
        </div>
      </CardContent>
      <CardFooter>
        <QuickAddButton product={product} quantity={price.quantity} />
      </CardFooter>
    </Card>
  );
}
