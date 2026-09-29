"use client";

import { HeartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSignedIn } from "@/lib/session";
import { useFavorites, useToggleFavorite } from "./queries";

/** Heart toggle; favorited = primary violet fill (05 §4 selected state). */
export function FavoriteButton({ productId, productName, size = "icon-sm" }: { productId: string; productName: string; size?: "icon-sm" | "icon" }) {
  const t = useTranslations("catalogue");
  const { membership } = useSignedIn();
  const favorites = useFavorites(membership.user.id);
  const toggle = useToggleFavorite(membership.user.id);
  const on = favorites.data?.some((f) => f.productId === productId) ?? false;
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-pressed={on}
      aria-label={on ? t("unfavorite", { product: productName }) : t("favorite", { product: productName })}
      disabled={favorites.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate(productId);
      }}
    >
      <HeartIcon className={cn(on && "fill-primary text-primary")} />
    </Button>
  );
}
