"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HeartIcon, MinusIcon, PlusIcon, ShoppingCartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  assetContentUrl,
  formatMoney,
  formatNumber,
  isDiscounted,
  isValidQuantity,
  offerStockStatus,
  priceSource,
  snapQuantity,
  stepQuantity,
  type Currency,
  type Offer,
  type PriceResolution,
  type QuantityRule,
} from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { useCart } from "@/lib/cart";
import { useErrorText } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useFavorites, useToggleFavorite } from "./queries";

/** Authenticated image URL for a READY media asset (browser cookies authenticate the request). */
export function assetUrl(assetId: string | null | undefined): string | undefined {
  if (!assetId) return undefined;
  try {
    return assetContentUrl(assetId);
  } catch {
    return undefined; // API not configured yet (server render) — placeholder instead.
  }
}

export function OfferImage({ assetId, alt, className, sizes }: { assetId: string | null | undefined; alt?: string; className?: string; sizes?: string }) {
  return <ProductImage src={assetUrl(assetId)} alt={alt} className={className} sizes={sizes} />;
}

/** Final unit price per unit, the list price struck through when lower, and why it is lower. Always NET_EXCLUDING_VAT. */
export function PriceBlock({
  price,
  currency,
  unit,
  size = "default",
}: {
  price: PriceResolution;
  currency: Currency;
  unit: string;
  size?: "default" | "lg";
}) {
  const t = useTranslations("product");
  const source = priceSource(price);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn("font-mono font-semibold tabular-nums", size === "lg" ? "text-2xl" : "text-base")}>
          {formatMoney(price.finalUnitPrice, currency)}
        </span>
        <span className="text-sm text-muted-foreground">{t("perUnit", { unit })}</span>
        {isDiscounted(price) && (
          <span className="font-mono text-sm text-muted-foreground tabular-nums line-through">{formatMoney(price.baseUnitPrice, currency)}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {source === "PROMOTION" && price.appliedPromotion && <Badge variant="success">{price.appliedPromotion.name}</Badge>}
        {source === "AGREED" && <Badge variant="brand">{t("agreedPrice")}</Badge>}
        {source === "TIER" && price.reachedTierThreshold !== null && (
          <Badge variant="info">{t("tierPrice", { qty: formatNumber(price.reachedTierThreshold) })}</Badge>
        )}
        <span className="text-xs text-muted-foreground">{t("netPrice")}</span>
      </div>
    </div>
  );
}

/** Minimum/step and stock badges for an offer. */
export function OfferBadges({ offer, extra }: { offer: Offer; extra?: string }) {
  const t = useTranslations("product");
  const { minimumQuantity, quantityStep } = offer.product;
  const stock = offerStockStatus(offer);
  return (
    <div className="flex flex-wrap gap-1">
      {minimumQuantity > 1 && <Badge variant="outline">{t("minShort", { qty: formatNumber(minimumQuantity) })}</Badge>}
      {quantityStep > 1 && <Badge variant="outline">{t("stepShort", { qty: formatNumber(quantityStep) })}</Badge>}
      {stock.kind === "OUT" && <Badge variant="destructive">{t("outOfStock")}</Badge>}
      {stock.kind === "AVAILABLE" && <Badge variant="secondary">{t("inStock", { qty: formatNumber(stock.quantity) })}</Badge>}
      {stock.kind === "UNCONFIRMED" && <Badge variant="warning">{t("stockUnconfirmed")}</Badge>}
      {extra && <Badge variant="secondary">{extra}</Badge>}
    </div>
  );
}

/** Shared-favorite heart; favorited = primary violet fill. */
export function FavoriteButton({ offer, size = "icon-sm" }: { offer: Offer; size?: "icon-sm" | "icon" }) {
  const t = useTranslations("product");
  const errorText = useErrorText();
  const favorites = useFavorites();
  const toggle = useToggleFavorite();
  const productId = offer.product.id;
  const on = favorites.data?.some((f) => f.productId === productId) ?? false;
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-pressed={on}
      aria-label={on ? t("unfavorite", { product: offer.product.name }) : t("favorite", { product: offer.product.name })}
      disabled={favorites.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate({ productId, on: !on, offer }, { onError: (error) => toast.error(errorText(error)) });
      }}
    >
      <HeartIcon className={cn(on && "fill-primary text-primary")} />
    </Button>
  );
}

/**
 * −/+ quantity input that only produces valid quantities for the rule (minimum, then whole
 * steps). Typed input is committed on blur/Enter and snapped up to the next valid quantity.
 */
export function QuantityStepper({
  value,
  rule,
  onChange,
  label,
  className,
}: {
  value: number;
  rule: QuantityRule;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}) {
  const t = useTranslations("product");
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const next = snapQuantity(Number(draft), rule);
    setDraft(null);
    if (next !== value) onChange(next);
  };
  const atMinimum = value <= rule.minimumQuantity;
  return (
    <InputGroup className={className ?? "w-36"}>
      <InputGroupAddon>
        <InputGroupButton size="icon-xs" aria-label={t("decrease", { label })} disabled={atMinimum} onClick={() => onChange(stepQuantity(value, rule, -1))}>
          <MinusIcon />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput
        inputMode="numeric"
        aria-label={label}
        aria-invalid={!isValidQuantity(value, rule) || undefined}
        className="text-center font-mono tabular-nums"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label={t("increase", { label })} onClick={() => onChange(stepQuantity(value, rule, 1))}>
          <PlusIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/** Adds to the active vendor's cart with a toast linking to the cart. Quantities stay valid: adding valid steps to a valid quantity. */
export function useAddToCart() {
  const t = useTranslations("product");
  const router = useRouter();
  const cart = useCart();
  return (offer: Offer, quantity: number) => {
    const inCart = cart.quantityOf(offer.product.id);
    // Adding to a line whose quantity became invalid would keep it invalid: snap the sum instead.
    const sum = inCart + quantity;
    const target = isValidQuantity(sum, offer.product) ? sum : snapQuantity(sum, offer.product);
    cart.add(offer, target - inCart);
    toast.success(t("added", { qty: formatNumber(quantity), product: offer.product.name }), {
      action: { label: t("viewCart"), onClick: () => router.push("/buyer/cart") },
    });
  };
}

/** Quick add from a card: adds the product's minimum quantity. */
export function QuickAddButton({ offer }: { offer: Offer }) {
  const t = useTranslations("product");
  const cart = useCart();
  const add = useAddToCart();
  const inCart = cart.quantityOf(offer.product.id);
  const quantity = inCart > 0 ? offer.product.quantityStep : offer.product.minimumQuantity;
  return (
    <Button
      size="sm"
      variant={inCart ? "outline" : "default"}
      aria-label={t("addAria", { qty: formatNumber(quantity), product: offer.product.name })}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        add(offer, quantity);
      }}
    >
      <ShoppingCartIcon data-icon="inline-start" />
      {inCart ? t("inCartAdd", { qty: formatNumber(inCart), step: formatNumber(quantity) }) : quantity > 1 ? t("addQty", { qty: formatNumber(quantity) }) : t("add")}
    </Button>
  );
}
