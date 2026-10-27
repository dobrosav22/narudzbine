"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileClockIcon, FilesIcon, LinkIcon, SaveIcon, ShoppingCartIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import {
  cartEstimate,
  checkCartLine,
  EMPTY_CART,
  formatMoney,
  formatNumber,
  snapshotFromOffer,
  type CartLineSnapshot,
  type Currency,
} from "@repo/core";
import { EmptyState, ErrorState } from "@/components/query-states";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cartStore, useCart } from "@/lib/cart";
import { useErrorText } from "@/lib/i18n";
import { useBusiness } from "@/lib/session";
import { isDraftConflict, useSaveCartAsDraft } from "./cart-actions";
import { DraftConflictDialog } from "./draft-conflict";
import { OfferImage, PriceBlock, QuantityStepper } from "./offer-parts";
import { useCartLineOffers } from "./queries";
import { useVendorContext } from "./vendor-context";

/**
 * The active vendor's local cart. Lines are re-priced from current offers at their quantities
 * (an estimate, excl. VAT — the order review gives the exact receipt). The cart can be saved as
 * shared saved work (a draft the whole team sees) and continues to update that draft while linked.
 */
export function CartScreen() {
  const t = useTranslations("cart");
  const ts = useTranslations("states");
  const errorText = useErrorText();
  const router = useRouter();
  const { organization } = useBusiness();
  const vendor = useVendorContext();
  const cart = useCart();
  const rows = useCartLineOffers(cart.scope?.vendorId, cart.lines);
  const save = useSaveCartAsDraft(cart.scope);
  const [conflict, setConflict] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const currency: Currency = rows.find((r) => r.offer)?.offer?.currency ?? organization.currency;

  // Keep line snapshots (names, rules, pictures) current with what the vendor publishes now.
  const fresh = rows.flatMap((r) => (r.offer ? [[r.line.productId, snapshotFromOffer(r.offer)] as const] : []));
  const freshKey = JSON.stringify(fresh);
  useEffect(() => {
    if (!cart.scope || fresh.length === 0) return;
    cartStore.updateSnapshots(cart.scope, Object.fromEntries(fresh) as Record<string, CartLineSnapshot>);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- freshKey captures `fresh`
  }, [cart.scope, freshKey]);

  if (vendor.isPending) return <Skeleton className="h-64 w-full" aria-busy="true" aria-label={ts("loading")} />;
  if (vendor.error) return <ErrorState error={vendor.error} onRetry={() => void vendor.refetch()} />;

  const checks = rows.map((r) => checkCartLine(r.line, r.offer, r.unavailable));
  const estimate = cartEstimate(rows);
  const blocking = checks.some((c) => c.unavailable || c.issue !== null) || rows.some((r) => r.isPending || !!r.error);
  const unavailableCount = checks.filter((c) => c.unavailable).length;
  const linked = cart.state.draft;

  const doSave = (asNew: boolean) =>
    save.mutate(
      { asNew },
      {
        onSuccess: () => toast.success(linked && !asNew ? t("draftUpdated") : t("draftSaved")),
        onError: (e) => (isDraftConflict(e) ? setConflict(true) : toast.error(errorText(e))),
      },
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          {vendor.active && <p className="text-sm text-muted-foreground">{t("orderFrom", { vendor: vendor.active.displayName })}</p>}
        </div>
        <Button asChild variant="outline">
          <Link href="/buyer/drafts">
            <FilesIcon data-icon="inline-start" />
            {t("savedDrafts")}
          </Link>
        </Button>
      </div>

      {cart.state.pendingSubmission && (
        <Alert>
          <FileClockIcon />
          <AlertTitle>{t("pendingTitle")}</AlertTitle>
          <AlertDescription>{t("pendingDescription")}</AlertDescription>
          <AlertAction>
            <Button size="sm" asChild>
              <Link href="/buyer/checkout">{t("pendingCheck")}</Link>
            </Button>
          </AlertAction>
        </Alert>
      )}

      {linked && (
        <Alert>
          <LinkIcon />
          <AlertTitle>{t("linkedTitle")}</AlertTitle>
          <AlertDescription>{t("linkedDescription")}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="ghost" onClick={() => cart.linkDraft(null)}>
              {t("unlink")}
            </Button>
          </AlertAction>
        </Alert>
      )}

      {!vendor.active ? (
        <EmptyState icon={ShoppingCartIcon} title={t("noVendorTitle")} description={t("noVendorDescription")} />
      ) : cart.lines.length === 0 ? (
        <EmptyState icon={ShoppingCartIcon} title={t("emptyTitle")} description={t("emptyDescription")}>
          <Button asChild variant="outline">
            <Link href="/buyer">{t("browse")}</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3 lg:col-span-2">
            {unavailableCount > 0 && (
              <Alert>
                <TriangleAlertIcon />
                <AlertDescription>{t("unavailable", { count: unavailableCount, countText: formatNumber(unavailableCount) })}</AlertDescription>
              </Alert>
            )}
            <div className="rounded-lg border">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("product")}</TableHead>
                    <TableHead className="text-right">{t("price")}</TableHead>
                    <TableHead className="w-40">{t("quantity")}</TableHead>
                    <TableHead className="text-right">{t("total")}</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">{t("remove")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ line, offer, error }, i) => {
                    const check = checks[i]!;
                    const snap = line.snapshot;
                    const name = offer?.product.name ?? snap?.name ?? t("unknownProduct");
                    const pricedHere = offer && offer.pricedQuantity === line.quantity;
                    return (
                      <TableRow key={line.productId} className={check.unavailable ? "text-muted-foreground" : undefined}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <OfferImage assetId={offer?.product.galleryAssetIds[0] ?? snap?.imageAssetId} className="size-12" />
                            <div className="flex min-w-0 flex-col gap-1">
                              {check.unavailable ? (
                                <span className="font-medium">{name}</span>
                              ) : (
                                <Link href={`/buyer/products/${line.productId}`} className="font-medium hover:underline">
                                  {name}
                                </Link>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {snap && <span className="font-mono">{offer?.product.sku ?? snap.sku}</span>}
                                {(offer?.product.packDescription ?? snap?.packDescription) && ` · ${offer?.product.packDescription ?? snap?.packDescription}`}
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {check.unavailable && <Badge variant="destructive">{t("noLongerAvailable")}</Badge>}
                                {check.issue && check.rule && (
                                  <Badge variant="warning">
                                    {t("quantityInvalid", { min: formatNumber(check.rule.minimumQuantity), step: formatNumber(check.rule.quantityStep) })}
                                  </Badge>
                                )}
                                {check.stockShort && offer?.availableQuantity !== null && offer && (
                                  <Badge variant="warning">{t("stockShort", { qty: formatNumber(offer.availableQuantity ?? 0) })}</Badge>
                                )}
                                {!!error && <Badge variant="outline">{t("priceUnavailable")}</Badge>}
                              </div>
                              {check.suggested !== null && (
                                <Button size="xs" variant="outline" className="w-fit" onClick={() => cart.setQuantity(line.productId, check.suggested!)}>
                                  {t("useQuantity", { qty: formatNumber(check.suggested) })}
                                </Button>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {offer && pricedHere ? (
                            <div className="flex justify-end">
                              <PriceBlock price={offer.effectivePrice} currency={offer.currency} unit={offer.unitName} />
                            </div>
                          ) : (
                            !check.unavailable && <Skeleton className="ml-auto h-5 w-16" />
                          )}
                        </TableCell>
                        <TableCell>
                          {!check.unavailable && check.rule && (
                            <QuantityStepper
                              value={line.quantity}
                              rule={check.rule}
                              onChange={(q) => cart.setQuantity(line.productId, q)}
                              label={t("quantityOf", { product: name })}
                            />
                          )}
                          {check.unavailable && <span className="font-mono tabular-nums">{formatNumber(line.quantity)}</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {offer && pricedHere ? formatMoney(offer.effectivePrice.lineTotal, offer.currency) : "—"}
                        </TableCell>
                        <TableCell>
                          <Button size="icon-sm" variant="ghost" aria-label={t("removeAria", { product: name })} onClick={() => cart.remove(line.productId)}>
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
              <Button variant="outline" disabled={save.isPending} onClick={() => doSave(false)}>
                {save.isPending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
                {linked ? t("updateDraft") : t("saveAsDraft")}
              </Button>
              {linked && (
                <Button variant="ghost" disabled={save.isPending} onClick={() => doSave(true)}>
                  {t("saveAsNewDraft")}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setConfirmClear(true)}>
                {t("clear")}
              </Button>
            </div>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{t("summary")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("products")}</span>
                <span className="font-mono tabular-nums">{formatNumber(cart.lines.length)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>{estimate.complete ? t("estimatedTotal") : t("partialTotal")}</span>
                <span className="font-mono tabular-nums">{formatMoney(estimate.total, currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("pricingNote")}</p>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-2">
              <Button disabled={blocking} onClick={() => router.push("/buyer/checkout")}>
                {t("checkout")}
              </Button>
              {blocking && <p className="text-xs text-muted-foreground">{t("fixBeforeCheckout")}</p>}
            </CardFooter>
          </Card>
        </div>
      )}

      <DraftConflictDialog scope={cart.scope} open={conflict} onOpenChange={setConflict} />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clearTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{linked ? t("clearLinkedDescription") : t("clearDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                // Never drop an unconfirmed submission: it is needed to reconcile a lost response.
                cart.replace({ ...EMPTY_CART, deliveryLocationId: cart.state.deliveryLocationId, pendingSubmission: cart.state.pendingSubmission })
              }
            >{t("clear")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
