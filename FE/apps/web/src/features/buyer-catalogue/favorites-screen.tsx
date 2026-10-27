"use client";

import Link from "next/link";
import { HeartIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatDate, splitFavorites } from "@repo/core";
import { EmptyState, ErrorState } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorText } from "@/lib/i18n";
import { ProductCard } from "./product-card";
import { useFavorites, useToggleFavorite } from "./queries";
import { useVendorContext } from "./vendor-context";

/**
 * Organization-shared favorites (GET /favorites): the active vendor's currently available ones
 * as cards, plus references that are no longer orderable (unpublished product, disconnected or
 * suspended vendor) which can only be removed.
 */
export function FavoritesScreen() {
  const t = useTranslations("favorites");
  const ts = useTranslations("states");
  const errorText = useErrorText();
  const vendor = useVendorContext();
  const favorites = useFavorites();
  const toggle = useToggleFavorite();
  const { current, unavailable } = splitFavorites(favorites.data ?? [], vendor.active?.vendorId ?? null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {vendor.active ? t("from", { vendor: vendor.active.displayName }) : t("shared")}
        </p>
      </div>
      {favorites.isError ? (
        <ErrorState error={favorites.error} onRetry={() => void favorites.refetch()} />
      ) : favorites.isPending || vendor.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label={ts("loading")}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : current.length === 0 ? (
        <EmptyState icon={HeartIcon} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button asChild variant="outline">
            <Link href="/buyer">{t("browse")}</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {current.map((f) => (
            <ProductCard key={f.productId} offer={f.offer!} />
          ))}
        </div>
      )}

      {unavailable.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("unavailableTitle")}</CardTitle>
            <CardDescription>{t("unavailableDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y" aria-label={t("unavailableTitle")}>
              {unavailable.map((f) => (
                <li key={f.productId} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="flex-1 text-sm text-muted-foreground">{t("savedOn", { date: formatDate(f.createdAt) })}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("removeUnavailable", { date: formatDate(f.createdAt) })}
                    disabled={toggle.isPending}
                    onClick={() =>
                      toggle.mutate({ productId: f.productId, on: false }, { onError: (e) => toast.error(errorText(e)) })
                    }
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {t("remove")}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
