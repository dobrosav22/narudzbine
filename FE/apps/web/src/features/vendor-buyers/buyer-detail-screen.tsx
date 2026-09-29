"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, UnplugIcon, UserXIcon } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatMoney, formatNumber, formatPercent, isServiceError, orderNumber, orderTotal } from "@repo/core";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/features/orders/status-badge";
import { useBuyerDetail, useRemoveConnection, useStatusConfig } from "@/features/vendor-orders/queries";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/i18n";

/** 03 → vendor per-buyer detail: their custom pricing overrides and order history with this vendor. */
export function BuyerDetailScreen({ vendorOrgId, buyerOrgId }: { vendorOrgId: string; buyerOrgId: string }) {
  const t = useTranslations("vendorBuyers");
  const td = useTranslations("vendorBuyers.detail");
  const errorText = useErrorText();
  const router = useRouter();
  const detail = useBuyerDetail(vendorOrgId, buyerOrgId);
  const config = useStatusConfig(vendorOrgId);
  const disconnect = useRemoveConnection(vendorOrgId);

  if (detail.isError) {
    return isServiceError(detail.error, "NOT_FOUND") ? (
      <EmptyState icon={UserXIcon} title={td("notFoundTitle")} description={td("notFoundDescription")}>
        <Button asChild variant="outline">
          <Link href="/vendor/buyers">{td("allBuyers")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
    );
  }
  if (detail.isPending) return <RowsSkeleton rows={6} />;
  const { buyerOrg, relation, overrides, orders, stats } = detail.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={td("back")}>
          <Link href="/vendor/buyers">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {buyerOrg.name}
            {relation.status === "active" ? <Badge variant="success">{t("connected")}</Badge> : <Badge variant="info">{t("inviteSent")}</Badge>}
          </h1>
          {relation.joinedAt && <p className="text-sm text-muted-foreground">{td("since", { date: formatDate(relation.joinedAt) })}</p>}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <UnplugIcon data-icon="inline-start" />
              {td("disconnect")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{td("disconnectTitle", { name: buyerOrg.name })}</AlertDialogTitle>
              <AlertDialogDescription>{td("disconnectDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{td("keep")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  disconnect.mutate(buyerOrg.id, {
                    onSuccess: () => {
                      toast.success(td("disconnected", { name: buyerOrg.name }));
                      router.push("/vendor/buyers");
                    },
                    onError: (e) => toast.error(errorText(e)),
                  })
                }
              >
                {td("disconnect")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [t("orders"), stats ? formatNumber(stats.orderCount) : "0"],
          [td("totalSpend"), formatMoney(stats?.spend ?? 0)],
          [t("lastOrder"), stats?.lastOrderAt ? formatDate(stats.lastOrderAt) : "—"],
        ].map(([label, value]) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="font-mono text-xl tabular-nums">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{td("prices")}</CardTitle>
          <CardDescription>{td("pricesDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground">{td("pricesEmpty", { name: buyerOrg.name })}</p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{td("product")}</TableHead>
                  <TableHead className="text-right">{td("listPrice")}</TableHead>
                  <TableHead className="text-right">{td("theirPrice")}</TableHead>
                  <TableHead className="text-right">{td("difference")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((o) => {
                  const base = o.product?.basePrice;
                  const diff = base ? ((o.price - base) / base) * 100 : undefined;
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        {o.product ? (
                          <Link href={`/vendor/catalogue/${o.product.id}`} className="font-medium hover:underline">
                            {o.product.name}
                          </Link>
                        ) : (
                          td("deletedProduct")
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{base !== undefined ? formatMoney(base) : "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(o.price)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                        {diff !== undefined ? `${diff > 0 ? "+" : ""}${formatPercent(Math.round(diff * 10) / 10)}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("orders")}</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{td("noOrders")}</p>
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{td("order")}</TableHead>
                  <TableHead>{td("placed")}</TableHead>
                  <TableHead className="text-right">{td("total")}</TableHead>
                  <TableHead className="text-right">{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/vendor/orders/${o.id}`} className="font-mono font-medium hover:underline">
                        {orderNumber(o)}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(o.createdAt)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(orderTotal(o))}</TableCell>
                    <TableCell className="text-right">
                      <StatusBadge config={config.data} statusKey={o.statusKey} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
