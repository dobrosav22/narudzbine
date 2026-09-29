"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, CircleCheckIcon, ClipboardXIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  isServiceError,
  orderNumber,
  orderTotal,
  roundMoney,
  type Order,
} from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cartStore } from "@/lib/cart";
import { sessionStore, useSignedIn } from "@/lib/session";
import {
  useBuyerLocations,
  useBuyerUsers,
  useOrder,
  useReorder,
  useStatusConfig,
  useVendorProductNames,
} from "./queries";
import { OrderThread } from "./order-thread";
import { StatusTracker } from "./status-tracker";
import { StatusBadge } from "./status-badge";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/i18n";

/** 03 → buyer "Order detail": status tracker from the vendor's statuses, message thread, reorder. */
export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const { membership } = useSignedIn();
  const t = useTranslations("orders");
  const order = useOrder(orderId);

  const notFound = (
    <EmptyState icon={ClipboardXIcon} title={t("notFoundTitle")} description={t("notFoundDescription")}>
      <Button asChild variant="outline">
        <Link href="/buyer/orders">{t("allOrders")}</Link>
      </Button>
    </EmptyState>
  );
  if (order.isError) return isServiceError(order.error, "NOT_FOUND") ? notFound : <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  if (order.isPending) return <RowsSkeleton rows={6} />;
  // Never show another buyer org's order, even if the id is guessed.
  if (order.data.buyerOrgId !== membership.org.id) return notFound;
  return <Detail order={order.data} />;
}

function Detail({ order }: { order: Order }) {
  const t = useTranslations("orders");
  const tc = useTranslations("cart");
  const errorText = useErrorText();
  const router = useRouter();
  const placed = useSearchParams().get("placed") === "1";
  const { membership, connectedVendors, activeVendor } = useSignedIn();
  const config = useStatusConfig(order.vendorOrgId);
  const products = useVendorProductNames(order.vendorOrgId);
  const locations = useBuyerLocations(order.buyerOrgId);
  const users = useBuyerUsers(order.buyerOrgId);
  const reorder = useReorder();
  const [confirmReorder, setConfirmReorder] = useState(false);
  const vendorName = connectedVendors.find((v) => v.id === order.vendorOrgId)?.name ?? t("vendor");
  const location = locations.data?.find((l) => l.id === order.locationId);
  const placedBy = users.data?.find((u) => u.id === order.createdByUserId)?.name;

  const doReorder = () =>
    reorder.mutate(order, {
      onSuccess: async (result) => {
        // The cart belongs to the order's vendor — make it the active one.
        if (activeVendor?.id !== order.vendorOrgId) await sessionStore.selectVendor(order.vendorOrgId);
        const skipped = result.unavailableProductIds.length;
        toast.success(
          skipped
            ? t("reorderedSkipped", { count: result.items.length, countText: formatNumber(result.items.length), skipped: formatNumber(skipped) })
            : t("reordered", { count: result.items.length, countText: formatNumber(result.items.length) }),
        );
        router.push("/buyer/cart");
      },
      onError: (e) => toast.error(errorText(e)),
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToOrders")}>
          <Link href="/buyer/orders">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {t.rich("heading", { number: orderNumber(order), mono: (chunks) => <span className="font-mono">{chunks}</span> })}
            <StatusBadge config={config.data} statusKey={order.statusKey} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {placedBy
              ? t("placedAtBy", { vendor: vendorName, when: formatDateTime(order.createdAt), name: placedBy })
              : t("placedAt", { vendor: vendorName, when: formatDateTime(order.createdAt) })}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={reorder.isPending}
          onClick={async () => {
            // Ask before replacing the cart of the ORDER's vendor, whichever vendor is active now.
            const target = { buyerOrgId: order.buyerOrgId, vendorOrgId: order.vendorOrgId };
            await cartStore.hydrate(target);
            if (cartStore.getLines(target).length) setConfirmReorder(true);
            else doReorder();
          }}
        >
          {reorder.isPending ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
          {t("reorder")}
        </Button>
      </div>

      {placed && (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>{t("placedTitle")}</AlertTitle>
          <AlertDescription>{t("placedDescription", { vendor: vendorName })}</AlertDescription>
        </Alert>
      )}

      {config.isError ? (
        <ErrorState error={config.error} onRetry={() => void config.refetch()} />
      ) : config.data ? (
        <StatusTracker config={config.data} statusKey={order.statusKey} />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{tc("items")}</CardTitle>
            <CardDescription>{t("pricesAsCharged")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{tc("product")}</TableHead>
                  <TableHead className="text-right">{t("qty")}</TableHead>
                  <TableHead className="text-right">{tc("price")}</TableHead>
                  <TableHead className="text-right">{tc("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((i) => {
                  const p = products.data?.get(i.productId);
                  return (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProductImage src={p?.imageUrl} className="size-10" />
                          <div className="flex flex-col">
                            <span className="font-medium">{p?.name ?? (products.isPending ? "…" : t("productGone"))}</span>
                            {p && <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatNumber(i.quantity)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(i.priceAtOrder)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(roundMoney(i.quantity * i.priceAtOrder))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>{tc("total")}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(orderTotal(order))}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("delivery")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{location?.name ?? "—"}</span>
            <span className="text-muted-foreground">{location?.address}</span>
          </CardContent>
        </Card>
      </div>

      <OrderThread
        orderId={order.id}
        side="buyer"
        myUserId={membership.user.id}
        counterpartName={vendorName}
        // [assumed] Vendor-side senders show as the vendor org — buyers don't list vendor staff.
        senderName={(m) => (m.senderOrgType === "vendor" ? vendorName : users.data?.find((u) => u.id === m.senderUserId)?.name ?? t("teammate"))}
      />

      <AlertDialog open={confirmReorder} onOpenChange={setConfirmReorder}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("replaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("reorderReplace")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={doReorder}>{tc("replace")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
