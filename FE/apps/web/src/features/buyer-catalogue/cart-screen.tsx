"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ShoppingCartIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import {
  checkoutProblems,
  defaultLocationId,
  defaultQuantity,
  priceNote,
  formatDateTime,
  formatMoney,
  formatNumber,
  type DraftCart,
} from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCart } from "@/lib/cart";
import { useErrorText, useMsg } from "@/lib/i18n";
import { useSignedIn } from "@/lib/session";
import { LocationSelect } from "@/features/orders/location-select";
import {
  useBuyerLocations,
  useBuyerUsers,
  useDiscardDraft,
  useDraftCarts,
  useParkCart,
  useResumeDraft,
} from "@/features/orders/queries";

import { QuantityStepper } from "./quantity-stepper";
import { useCartPricing } from "./queries";

/**
 * 03 → buyer "Cart" + "Draft carts": lines for the active vendor + a delivery
 * location, prices re-resolved at current quantities, save for later, and the
 * org's saved carts (the user's own first — 01 §6).
 */
export function CartScreen() {
  const t = useTranslations("cart");
  const tm = useMsg();
  const errorText = useErrorText();
  const router = useRouter();
  const { activeVendor, membership } = useSignedIn();
  const cart = useCart();
  const pricing = useCartPricing(cart.scope, cart.lines);
  const locations = useBuyerLocations(membership.org.id);
  const park = useParkCart(cart.scope, membership.user.id);
  const [pendingResume, setPendingResume] = useState<DraftCart>();
  const resume = useResumeDraft(cart.scope);

  // The chosen location, else the user's home location (a default, not a restriction — 01 §1).
  const locationId = cart.state.locationId ?? defaultLocationId(locations.data ?? [], membership.user.homeLocationId);
  const problems = pricing.data && locations.data ? checkoutProblems({ rows: pricing.data.rows, locationId, locations: locations.data }) : [];
  const unavailable = pricing.data?.rows.filter((r) => !r.product) ?? [];

  const doResume = (draft: DraftCart) => {
    resume(draft);
    toast.success(t("savedLoaded"));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {activeVendor && <p className="text-sm text-muted-foreground">{t("orderFrom", { vendor: activeVendor.name })}</p>}
      </div>

      {cart.lines.length === 0 ? (
        <EmptyState icon={ShoppingCartIcon} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button asChild variant="outline">
            <Link href="/buyer">{t("browse")}</Link>
          </Button>
        </EmptyState>
      ) : pricing.isError ? (
        <ErrorState error={pricing.error} onRetry={() => void pricing.refetch()} />
      ) : pricing.isPending ? (
        <RowsSkeleton rows={Math.min(cart.lines.length + 1, 6)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3 lg:col-span-2">
            {cart.state.draftCartId && (
              <p className="text-sm text-muted-foreground">{t("editingSaved")}</p>
            )}
            {unavailable.length > 0 && (
              <Alert>
                <TriangleAlertIcon />
                <AlertDescription>
                  {t("unavailable", { count: unavailable.length, countText: formatNumber(unavailable.length) })}
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-lg border">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("product")}</TableHead>
                    <TableHead className="text-right">{t("price")}</TableHead>
                    <TableHead className="w-36">{t("quantity")}</TableHead>
                    <TableHead className="text-right">{t("total")}</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">{t("remove")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricing.data.rows.map(({ line, product, price, belowMinimum }) => {
                    const note = price && priceNote(price);
                    return (
                      <TableRow key={line.productId} className={product ? undefined : "text-muted-foreground"}>
                        <TableCell>
                          {product ? (
                            <div className="flex items-center gap-3">
                              <ProductImage src={product.imageUrl} className="size-12" />
                              <div className="flex flex-col gap-1">
                                <Link href={`/buyer/products/${product.id}`} className="font-medium hover:underline">
                                  {product.name}
                                </Link>
                                <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                                {belowMinimum && <Badge variant="warning">{t("minimumOrder", { qty: formatNumber(defaultQuantity(product)) })}</Badge>}
                              </div>
                            </div>
                          ) : (
                            <span>{t("noLongerAvailable")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {price && (
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-mono tabular-nums">{formatMoney(price.unitPrice)}</span>
                              {note && <Badge variant={note.variant}>{tm(note.msg)}</Badge>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {product && (
                            <QuantityStepper
                              value={line.quantity}
                              min={defaultQuantity(product)}
                              onChange={(q) => cart.setQuantity(product.id, q)}
                              label={t("quantityOf", { product: product.name })}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{price ? formatMoney(price.lineTotal) : "—"}</TableCell>
                        <TableCell>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t("removeAria", { product: product?.name ?? t("unavailableProduct") })}
                            onClick={() => cart.remove(line.productId)}
                          >
                            <Trash2Icon />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={park.isPending}
                onClick={() =>
                  park.mutate(undefined, {
                    onSuccess: () => toast.success(t("saved")),
                    onError: (e) => toast.error(errorText(e)),
                  })
                }
              >
                {park.isPending ? <Spinner data-icon="inline-start" /> : <ArchiveIcon data-icon="inline-start" />}
                {t("saveForLater")}
              </Button>
              <Button variant="ghost" onClick={() => cart.clear()}>
                {t("clear")}
              </Button>
            </div>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{t("summary")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <Field>
                <FieldLabel htmlFor="cart-location">{t("deliverTo")}</FieldLabel>
                {locations.isError ? (
                  <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
                ) : (
                  <LocationSelect id="cart-location" locations={locations.data ?? []} value={locationId} onChange={cart.setLocation} />
                )}
                {locationId && locations.data && (
                  <FieldDescription>{locations.data.find((l) => l.id === locationId)?.address}</FieldDescription>
                )}
              </Field>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("items")}</span>
                <span className="font-mono tabular-nums">{formatNumber(pricing.data.itemCount)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>{t("total")}</span>
                <span className="font-mono tabular-nums">{formatMoney(pricing.data.total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("pricingNote")}</p>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-2">
              <Button
                disabled={problems.length > 0}
                onClick={() => {
                  // Persist the default so checkout shows the same location.
                  if (locationId && !cart.state.locationId) cart.setLocation(locationId);
                  router.push("/buyer/checkout");
                }}
              >
                {t("checkout")}
              </Button>
              {problems.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
                  {problems.map((p) => (
                    <li key={p.key}>{tm(p)}</li>
                  ))}
                </ul>
              )}
            </CardFooter>
          </Card>
        </div>
      )}

      <SavedCarts
        onResume={(draft) => (cart.lines.length > 0 ? setPendingResume(draft) : doResume(draft))}
        currentDraftId={cart.state.draftCartId}
      />

      <AlertDialog open={!!pendingResume} onOpenChange={(o) => !o && setPendingResume(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("replaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("replaceDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingResume && doResume(pendingResume)}>{t("replace")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Draft carts for this buyer org + vendor — visible to the whole team, mine first (01 §6). */
function SavedCarts({ onResume, currentDraftId }: { onResume: (d: DraftCart) => void; currentDraftId?: string }) {
  const t = useTranslations("cart");
  const { membership } = useSignedIn();
  const cart = useCart();
  const drafts = useDraftCarts(cart.scope, membership.user.id);
  const users = useBuyerUsers(membership.org.id);
  const locations = useBuyerLocations(membership.org.id);
  const discard = useDiscardDraft(cart.scope);
  const name = (id: string) => (id === membership.user.id ? t("you") : users.data?.find((u) => u.id === id)?.name ?? t("teammate"));

  if (drafts.isError) return <ErrorState error={drafts.error} onRetry={() => void drafts.refetch()} />;
  const list = (drafts.data ?? []).filter((d) => d.id !== currentDraftId);
  if (drafts.isPending || list.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("savedTitle")}</CardTitle>
        <CardDescription>{t("savedDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y" aria-label={t("savedTitle")}>
          {list.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {t("savedLine", { who: name(d.createdByUserId), count: d.items.reduce((n, i) => n + i.quantity, 0), countText: formatNumber(d.items.reduce((n, i) => n + i.quantity, 0)) })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("savedMeta", { location: locations.data?.find((l) => l.id === d.locationId)?.name ?? t("noLocation"), when: formatDateTime(d.updatedAt) })}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => onResume(d)}>
                {t("resume")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t("discardAria", { who: name(d.createdByUserId) })}
                onClick={() => discard.mutate(d, { onSuccess: () => toast.success(t("discarded")) })}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
