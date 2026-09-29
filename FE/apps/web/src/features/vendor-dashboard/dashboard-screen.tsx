"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, ClipboardListIcon, PackageCheckIcon } from "lucide-react";
import {
  countMsg,
  describeDiscount,
  describeScope,
  formatDate,
  formatMoney,
  formatNumber,
  hasActivity,
  orderNumber,
  orderTotal,
  promotionState,
} from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePromotions } from "@/features/merchandising/queries";
import { StatusBadge } from "@/features/orders/status-badge";
import { MonthlyChart } from "@/features/stats/charts";
import { useVendorSummary } from "@/features/stats/queries";
import { StatCard } from "@/features/stats/stat-parts";
import { useCategories, useVendorOrg } from "@/features/vendor-catalogue/queries";
import { useVendorOrderContext } from "@/features/vendor-orders/queries";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

/** 03 → vendor "Dashboard": recent orders, revenue trend, low-stock alerts if tracking is on. */
export function DashboardScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const summary = useVendorSummary(vendorOrgId);
  const context = useVendorOrderContext(vendorOrgId);
  const org = useVendorOrg(vendorOrgId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{org.data?.name ?? " "}</p>
      </div>

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("revenue30")} value={formatMoney(summary.data.revenueLast30d)} footer={t("cancelledExcluded")} />
            <StatCard label={t("orders30")} value={formatNumber(summary.data.ordersLast30d)} footer={t("seeStats")} href="/vendor/stats" />
            <StatCard label={t("openOrders")} value={formatNumber(summary.data.openOrders)} footer={t("goOrders")} href="/vendor/orders" />
            <StatCard label={t("activeBuyers")} value={formatNumber(summary.data.activeBuyers)} footer={t("goBuyers")} href="/vendor/buyers" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("revenueByMonth")}</CardTitle>
                <CardDescription>{t("revenueNote")}</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/vendor/stats">
                      {t("stats")}
                      <ArrowRightIcon data-icon="inline-end" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {hasActivity(summary.data.revenueByMonth) ? (
                  <MonthlyChart buckets={summary.data.revenueByMonth} label={t("revenue")} />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noRevenue")}</p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              {org.data?.tracksInventory && <LowStockCard products={summary.data.lowStockProducts} />}
              <LivePromotionsCard vendorOrgId={vendorOrgId} />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("recentOrders")}</CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/vendor/orders">
                    {t("allOrders")}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {summary.data.recentOrders.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ClipboardListIcon />
                    </EmptyMedia>
                    <EmptyTitle>{t("noOrdersTitle")}</EmptyTitle>
                    <EmptyDescription>{t("noOrdersDescription")}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table className="text-sm" aria-label={t("recentOrders")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("order")}</TableHead>
                      <TableHead>{t("buyer")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("placed")}</TableHead>
                      <TableHead className="text-right">{t("total")}</TableHead>
                      <TableHead className="text-right">{t("status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.data.recentOrders.map((o) => (
                      <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/vendor/orders/${o.id}`)}>
                        <TableCell>
                          <Link
                            href={`/vendor/orders/${o.id}`}
                            className="font-mono font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {orderNumber(o)}
                          </Link>
                        </TableCell>
                        <TableCell>{context.data?.buyers.get(o.buyerOrgId)?.name ?? "…"}</TableCell>
                        <TableCell className="hidden sm:table-cell">{formatDate(o.createdAt)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatMoney(orderTotal(o))}</TableCell>
                        <TableCell className="text-right">
                          <StatusBadge config={context.data?.config} statusKey={o.statusKey} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function LowStockCard({ products }: { products: { id: string; name: string; stock?: number; unit: string }[] }) {
  const t = useTranslations("dashboard");
  const tm = useMsg();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("lowStock")}</CardTitle>
        <CardDescription>{products.length ? tm(countMsg("dashboard.runningLow", products.length)) : t("allStocked")}</CardDescription>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PackageCheckIcon />
            {t("noneLow")}
          </div>
        ) : (
          <ul aria-label={t("lowStockAria")} className="flex flex-col gap-2">
            {products.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/vendor/catalogue/${p.id}`} className="truncate hover:underline">
                  {p.name}
                </Link>
                <Badge variant={p.stock === 0 ? "destructive" : "warning"}>
                  {p.stock === 0 ? t("outOfStock") : t("left", { count: formatNumber(p.stock ?? 0) })}
                </Badge>
              </li>
            ))}
            {products.length > 6 && (
              <li className="text-sm text-muted-foreground">
                <Link href="/vendor/catalogue" className="hover:text-foreground hover:underline">
                  {t("more", { count: formatNumber(products.length - 6) })}
                </Link>
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LivePromotionsCard({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("dashboard");
  const tm = useMsg();
  const promotions = usePromotions(vendorOrgId);
  const categories = useCategories(vendorOrgId);
  const context = useVendorOrderContext(vendorOrgId);
  const live = (promotions.data ?? []).filter((p) => promotionState(p) === "live");
  const upcoming = (promotions.data ?? []).filter((p) => promotionState(p) === "scheduled").length;
  const names = new Map<string, string>([
    ...(categories.data ?? []).map((c) => [c.id, c.name] as const),
    ...[...(context.data?.products.values() ?? [])].map((p) => [p.id, p.name] as const),
    ...[...(context.data?.buyers.values() ?? [])].map((b) => [b.id, b.name] as const),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("promotions")}</CardTitle>
        <CardDescription>
          {promotions.data
            ? `${t("live", { count: formatNumber(live.length) })}${upcoming ? ` · ${t("scheduled", { count: formatNumber(upcoming) })}` : ""}`
            : " "}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/vendor/catalogue/promotions">{t("manage")}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {promotions.isError ? (
          <ErrorState error={promotions.error} onRetry={() => void promotions.refetch()} />
        ) : promotions.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : live.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noLive")}</p>
        ) : (
          <ul aria-label={t("liveAria")} className="flex flex-col gap-2">
            {live.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{tm(describeScope(p, names))}</span>
                <Badge variant="success">{tm(describeDiscount(p))}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  const t = useTranslations("states");
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={t("loading")}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
      <RowsSkeleton rows={5} />
    </div>
  );
}
