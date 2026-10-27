"use client";

import Link from "next/link";
import type { Offer } from "@repo/core";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FavoriteButton, OfferBadges, OfferImage, PriceBlock, QuickAddButton } from "./offer-parts";

/** A buyer-specific offer in a grid: picture, name, SKU/pack, price at the minimum quantity, quick add. */
export function ProductCard({ offer, extra }: { offer: Offer; extra?: string }) {
  const { product } = offer;
  const href = `/buyer/products/${product.id}`;
  return (
    <Card size="sm" className="h-full pt-0">
      <Link href={href} tabIndex={-1} aria-hidden>
        <OfferImage
          assetId={product.galleryAssetIds[0]}
          className="aspect-[4/3] w-full rounded-none"
          sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
        />
      </Link>
      <CardHeader>
        <CardTitle className="leading-snug">
          <Link href={href} className="hover:underline">
            {product.name}
          </Link>
        </CardTitle>
        <CardDescription className="text-xs">
          <span className="font-mono">{product.sku}</span>
          {product.packDescription && ` · ${product.packDescription}`}
        </CardDescription>
        <CardAction>
          <FavoriteButton offer={offer} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <PriceBlock price={offer.effectivePrice} currency={offer.currency} unit={offer.unitName} />
        <OfferBadges offer={offer} extra={extra} />
      </CardContent>
      <CardFooter>
        <QuickAddButton offer={offer} />
      </CardFooter>
    </Card>
  );
}
