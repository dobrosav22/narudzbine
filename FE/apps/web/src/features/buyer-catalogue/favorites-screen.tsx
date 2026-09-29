"use client";

import Link from "next/link";
import { HeartIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignedIn } from "@/lib/session";
import { ProductCard } from "./product-card";
import { useBuyerCatalogue, useFavorites } from "./queries";

/** 03 → buyer "Favorites": the user's favorited products from the active vendor, ready to add to cart. */
export function FavoritesScreen() {
  const t = useTranslations("favorites");
  const ts = useTranslations("states");
  const { membership, activeVendor } = useSignedIn();
  const favorites = useFavorites(membership.user.id);
  const catalogue = useBuyerCatalogue(
    { vendorOrgId: activeVendor?.id ?? "", buyerOrgId: membership.org.id },
    { search: "", tagIds: [] },
  );
  const failed = favorites.isError ? favorites : catalogue.isError ? catalogue : undefined;
  // Favorites span vendors; show the active vendor's (and skip ones no longer available).
  const ids = new Set(favorites.data?.map((f) => f.productId));
  const items = catalogue.data?.filter((i) => ids.has(i.product.id)) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {activeVendor && <p className="text-sm text-muted-foreground">{t("from", { vendor: activeVendor.name })}</p>}
      </div>
      {failed ? (
        <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
      ) : favorites.isPending || catalogue.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label={ts("loading")}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={HeartIcon}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        >
          <Button asChild variant="outline">
            <Link href="/buyer">{t("browse")}</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <ProductCard key={item.product.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
