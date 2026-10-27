"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, ClipboardListIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  dashboardQueries,
  formatDate,
  formatMoney,
  formatNumber,
  inventoryQueries,
  localToday,
  orderStateTone,
  presetReportRange,
  reportHasActivity,
  usageMsg,
} from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodChart } from "@/features/stats/charts";
import { useReportSummary } from "@/features/stats/queries";
import { StatCard } from "@/features/stats/stat-parts";
import { PLAN_SETTINGS_HREF } from "@/features/subscription/plan-limit";
import { useVendorPlan } from "@/features/subscription/queries";
import { useMsg } from "@/lib/i18n";
import { useBusiness } from "@/lib/session";

/**
 * Vendor home: delivered sales of the last 30 days (country-local), orders waiting for a
 * decision, recent orders, plan usage, inventory tracking and running promotions. The backend
 * has no low-stock list or alert threshold, so no stock alert is shown (see gaps).
 */
export function DashboardScreen() {
  const t = useTranslations("dashboard");
  const tm = useMsg();
  const { organization } = useBusiness();
  const currency = organization.currency;
  const range = presetReportRange("30d", localToday());
  const summary = useReportSummary(range);
  const awaiting = useQuery(dashboardQueries.awaitingAcceptance());
  const plan = useVendorPlan();
  const tracking = useQuery(inventoryQueries.tracking());
  const promotions = useQuery(dashboardQueries.runningPromotions());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{organization.displayName}</p>
      </div>

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("sales30")} value={formatMoney(summary.data.goodsTotal, currency)} footer={t("deliveredNote")} />
          <StatCard label={t("orders30")} value={formatNumber(summary.data.orderCount)} footer={t("seeStats")} href="/vendor/stats" />
          <StatCard
            label={t("awaiting")}
            value={awaiting.data ? `${formatNumber(awaiting.data.count)}${awaiting.data.more ? "+" : ""}` : "—"}
            footer={t("goOrders")}
            href="/vendor/orders?state=AWAITING_ACCEPTANCE"
          />
          <StatCard label={t("activeBuyers")} value={formatNumber(summary.data.activeBuyerCount ?? 0)} footer={t("goBuyers")} href="/vendor/buyers" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("salesByDay")}</CardTitle>
            <CardDescription>{t("salesNote")}</CardDescription>
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
            {summary.isPending ? (
              <Skeleton className="h-56 w-full" />
            ) : summary.data && reportHasActivity(summary.data.buckets) ? (
              <PeriodChart buckets={summary.data.buckets} grouping={summary.data.grouping} currency={currency} label={t("sales")} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("noSales")}</p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("plan")}</CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href={PLAN_SETTINGS_HREF}>{t("manage")}</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {plan.isError ? (
                <span className="text-muted-foreground">{t("unavailable")}</span>
              ) : plan.data ? (
                <>
                  <span>{tm(usageMsg(plan.data, "products"))}</span>
                  <span>{tm(usageMsg(plan.data, "buyers"))}</span>
                </>
              ) : (
                <Skeleton className="h-10 w-full" />
              )}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("inventory")}</CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/vendor/catalogue/inventory">{t("manage")}</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {tracking.data ? (tracking.data.enabled ? t("trackingOn") : t("trackingOff")) : tracking.isError ? t("unavailable") : <Skeleton className="h-5 w-full" />}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t("promotions")}</CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/vendor/catalogue/promotions">{t("manage")}</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {promotions.data !== undefined ? (
                t("running", { count: promotions.data, countText: formatNumber(promotions.data) })
              ) : promotions.isError ? (
                t("unavailable")
              ) : (
                <Skeleton className="h-5 w-full" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <RecentOrders />
    </div>
  );
}

function RecentOrders() {
  const t = useTranslations("dashboard");
  const ts = useTranslations("ordState");
  const router = useRouter();
  const orders = useQuery(dashboardQueries.recentOrders(5));

  return (
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
        {orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
        ) : orders.isPending ? (
          <RowsSkeleton rows={5} />
        ) : orders.data.length === 0 ? (
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
              {orders.data.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/vendor/orders/${o.id}`)}>
                  <TableCell>
                    <Link href={`/vendor/orders/${o.id}`} className="font-mono font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {o.number}
                    </Link>
                  </TableCell>
                  <TableCell>{o.buyer.displayName}</TableCell>
                  <TableCell className="hidden sm:table-cell">{formatDate(o.submittedAt)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(o.goodsTotal, o.currency)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={orderStateTone(o.state)}>
                      {o.state === "ACCEPTED" && o.stageName ? ts("withStage", { state: ts(o.state), stage: o.stageName }) : ts(o.state)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
