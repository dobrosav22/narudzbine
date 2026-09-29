"use client";

import { useRouter } from "next/navigation";
import { ShoppingCartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatNumber, type Product } from "@repo/core";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";

/** Toast after adding, with a way to the cart — shared by quick-add and the detail page. */
export function useAddToCart() {
  const t = useTranslations("catalogue");
  const router = useRouter();
  const cart = useCart();
  return (product: Product, quantity: number) => {
    cart.add(product.id, quantity);
    toast.success(t("added", { qty: formatNumber(quantity), product: product.name }), {
      action: { label: t("viewCart"), onClick: () => router.push("/buyer/cart") },
    });
  };
}

/** Quick add from a card: adds the minimum order quantity (or 1). */
export function QuickAddButton({ product, quantity }: { product: Product; quantity: number }) {
  const t = useTranslations("catalogue");
  const cart = useCart();
  const add = useAddToCart();
  const inCart = cart.quantityOf(product.id);
  return (
    <Button
      size="sm"
      variant={inCart ? "outline" : "default"}
      aria-label={t("addAria", { qty: formatNumber(quantity), product: product.name })}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        add(product, quantity);
      }}
    >
      <ShoppingCartIcon data-icon="inline-start" />
      {inCart ? t("inCartAdd", { qty: formatNumber(inCart) }) : quantity > 1 ? t("addQty", { qty: formatNumber(quantity) }) : t("add")}
    </Button>
  );
}
