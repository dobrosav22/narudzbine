"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, ClipboardXIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import {
  cancelledStatus,
  formatDateTime,
  formatMoney,
  formatNumber,
  isServiceError,
  nextStatus,
  orderNumber,
  orderTotal,
  roundMoney,
  statusLabel,
  type Order,
  type VendorOrderContext,
} from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
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
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSignedIn } from "@/lib/session";
import { OrderThread } from "@/features/orders/order-thread";
import { StatusBadge } from "@/features/orders/status-badge";
import { StatusTracker } from "@/features/orders/status-tracker";
import { useUpdateOrderStatus, useVendorOrder, useVendorOrderContext } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText, useMsg } from "@/lib/i18n";

/**
 * 03 → vendor "Order detail": line items, buyer/location info, status changer
 * driven by the vendor's own config (not a hardcoded stepper), message thread.
 */
export function VendorOrderDetailScreen({ vendorOrgId, orderId }: { vendorOrgId: string; orderId: string }) {
  const t = useTranslations("vendorOrders");
  const to = useTranslations("orders");
  const order = useVendorOrder(orderId);
  const ctx = useVendorOrderContext(vendorOrgId);
  const notFound = (
    <EmptyState icon={ClipboardXIcon} title={to("notFoundTitle")} description={t("notFoundDescription")}>
      <Button asChild variant="outline">
        <Link href="/vendor/orders">{to("allOrders")}</Link>
      </Button>
    </EmptyState>
  );
  if (order.isError) return isServiceError(order.error, "NOT_FOUND") ? notFound : <ErrorState error={order.error} onRetry={() => void order.refetch()} />;
  if (ctx.isError) return <ErrorState error={ctx.error} onRetry={() => void ctx.refetch()} />;
  if (!order.data || !ctx.data) return <RowsSkeleton rows={6} />;
  // Never show another vendor's order, even if the id is guessed.
  if (order.data.vendorOrgId !== vendorOrgId) return notFound;
  return <Detail order={order.data} ctx={ctx.data} vendorOrgId={vendorOrgId} />;
}

function Detail({ order, ctx, vendorOrgId }: { order: Order; ctx: VendorOrderContext; vendorOrgId: string }) {
  const t = useTranslations("vendorOrders");
  const to = useTranslations("orders");
  const errorText = useErrorText();
  const tm = useMsg();
  const { membership } = useSignedIn();
  const update = useUpdateOrderStatus(vendorOrgId, order.id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const next = nextStatus(ctx.config, order.statusKey);
  const cancelled = cancelledStatus(ctx.config);
  const current = ctx.config.statuses.find((s) => s.key === order.statusKey);
  const buyer = ctx.buyers.get(order.buyerOrgId);
  const buyerName = buyer?.name ?? t("buyer");
  const location = ctx.buyerLocations.get(order.locationId);
  const warehouse = order.fulfillingLocationId ? ctx.vendorLocations.get(order.fulfillingLocationId) : undefined;
  const placedBy = ctx.buyerUsers.get(order.createdByUserId)?.name;

  const setStatus = (statusKey: string) => {
    const label = tm(statusLabel(ctx.config.statuses.find((s) => s.key === statusKey), statusKey));
    update.mutate(statusKey, {
      // 01 §5: the buyer is notified of every change (push/email per their preferences — backend).
      onSuccess: () => toast.success(t("statusChanged", { number: orderNumber(order), status: label })),
      onError: (e) => toast.error(errorText(e)),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={to("backToOrders")}>
          <Link href="/vendor/orders">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {to.rich("heading", { number: orderNumber(order), mono: (chunks) => <span className="font-mono">{chunks}</span> })}
            <StatusBadge config={ctx.config} statusKey={order.statusKey} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {placedBy
              ? to("placedAtBy", { vendor: buyerName, when: formatDateTime(order.createdAt), name: placedBy })
              : to("placedAt", { vendor: buyerName, when: formatDateTime(order.createdAt) })}
          </p>
        </div>
      </div>

      <StatusTracker config={ctx.config} statusKey={order.statusKey} />

      <Card>
        <CardHeader>
          <CardTitle>{to("status")}</CardTitle>
          <CardDescription>{t("statusDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          {next && (
            <Button disabled={update.isPending} onClick={() => setStatus(next.key)}>
              {update.isPending ? <Spinner data-icon="inline-start" /> : <ArrowRightIcon data-icon="inline-start" />}
              {t("markAs", { status: tm(statusLabel(next)) })}
            </Button>
          )}
          <Field className="w-56">
            <FieldLabel htmlFor="set-status">{t("setAny")}</FieldLabel>
            <Select
              value={order.statusKey}
              onValueChange={(key) => {
                if (key === order.statusKey) return;
                if (ctx.config.statuses.find((s) => s.key === key)?.isCancelled) setConfirmCancel(true);
                else setStatus(key);
              }}
            >
              <SelectTrigger id="set-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ctx.config.statuses.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {tm(statusLabel(s))}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {cancelled && !current?.isCancelled && (
            <Button variant="destructive" className="ml-auto" onClick={() => setConfirmCancel(true)}>
              <XCircleIcon data-icon="inline-start" />
              {t("cancelOrder")}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("items")}</CardTitle>
            <CardDescription>{to("pricesAsCharged")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("product")}</TableHead>
                  <TableHead className="text-right">{to("qty")}</TableHead>
                  <TableHead className="text-right">{t("price")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((i) => {
                  const p = ctx.products.get(i.productId);
                  return (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProductImage src={p?.imageUrl} className="size-10" />
                          {p ? (
                            <Link href={`/vendor/catalogue/${p.id}`} className="flex flex-col hover:underline">
                              <span className="font-medium">{p.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{t("deletedProduct")}</span>
                          )}
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
                  <TableCell colSpan={3}>{t("total")}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(orderTotal(order))}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("buyer")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {buyer ? (
                <Link href={`/vendor/buyers/${buyer.id}`} className="font-medium hover:underline">
                  {buyer.name}
                </Link>
              ) : (
                <span className="font-medium">{t("formerBuyer")}</span>
              )}
              {placedBy && <span className="text-muted-foreground">{t("placedBy", { name: placedBy })}</span>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("deliverTo")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{location?.name ?? "—"}</span>
              <span className="text-muted-foreground">{location?.address}</span>
            </CardContent>
          </Card>
          {warehouse && (
            <Card>
              <CardHeader>
                <CardTitle>{t("fulfillingFrom")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{warehouse.name}</span>
                <span className="text-muted-foreground">{warehouse.address}</span>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <OrderThread
        orderId={order.id}
        side="vendor"
        myUserId={membership.user.id}
        counterpartName={buyerName}
        senderName={(m) =>
          m.senderOrgType === "vendor"
            ? ctx.vendorUsers.get(m.senderUserId)?.name ?? t("yourTeam")
            : `${ctx.buyerUsers.get(m.senderUserId)?.name ?? t("buyer")} · ${buyerName}`
        }
      />

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelTitle", { number: orderNumber(order) })}</AlertDialogTitle>
            <AlertDialogDescription>{t("cancelDescription", { buyer: buyerName, status: cancelled ? tm(statusLabel(cancelled)) : t("cancelled") })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepOrder")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => cancelled && setStatus(cancelled.key)}>
              {t("cancelOrder")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
