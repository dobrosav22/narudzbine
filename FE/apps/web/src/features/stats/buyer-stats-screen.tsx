"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3Icon } from "lucide-react";
import {
  averageOrderValue,
  DEFAULT_STATS_PERIOD,
  formatMoney,
  formatNumber,
  formatPercent,
  hasActivity,
  periodKey,
  type StatsPeriod,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuyerLocations } from "@/features/orders/queries";
import { useSignedIn } from "@/lib/session";
import { MonthlyChart } from "./charts";
import { useBuyerSummary } from "./queries";
import { LocationSelect, PeriodSelect, StatCard } from "./stat-parts";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

/**
 * 03 → buyer "Own stats": spend and order frequency by product and period, scoped to
 * this buyer org + the active vendor (01 §6). Location = the buyer's delivery location.
 */
export function BuyerStatsScreen() {
  const t = useTranslations("stats");
  const tm = useMsg();
  const { membership, activeVendor } = useSignedIn();
  const [period, setPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD);
  const [locationId, setLocationId] = useState<string>();
  const scope = activeVendor && { vendorOrgId: activeVendor.id, buyerOrgId: membership.org.id };
  const summary = useBuyerSummary(scope, { period, locationId });
  const locations = useBuyerLocations(membership.org.id);

  if (!activeVendor) {
    return <EmptyState icon={BarChart3Icon} title={t("noVendorsTitle")} description={t("noVendorsDescription")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("yourSpending", { vendor: activeVendor.name, period: tm({ key: periodKey(period) }) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PeriodSelect value={period} onChange={setPeriod} />
          {(locations.data?.length ?? 0) > 1 && (
            <LocationSelect
              value={locationId}
              onChange={setLocationId}
              locations={locations.data!}
              allLabel={t("allLocations")}
              ariaLabel={t("filterLocation")}
            />
          )}
        </div>
      </div>

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label={t("loading")}>
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
          <RowsSkeleton rows={5} />
        </div>
      ) : summary.data.orderCount === 0 ? (
        <EmptyState
          icon={BarChart3Icon}
          title={t("noOrdersTitle")}
          description={t("noOrdersDescription", { vendor: activeVendor.name })}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={t("totalSpend")} value={formatMoney(summary.data.totalSpend)} />
            <StatCard label={t("ordersCol")} value={formatNumber(summary.data.orderCount)} />
            <StatCard label={t("averageOrder")} value={formatMoney(averageOrderValue(summary.data.totalSpend, summary.data.orderCount))} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("spendByMonth")}</CardTitle>
              <CardDescription>{t("monthlyNote")}</CardDescription>
            </CardHeader>
            <CardContent>
              {hasActivity(summary.data.byPeriod) ? (
                <MonthlyChart buckets={summary.data.byPeriod} label={t("spend")} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("noMonthly")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("byProduct")}</CardTitle>
              <CardDescription>{t("byProductNote")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="text-sm" aria-label={t("spendByProduct")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("product")}</TableHead>
                    <TableHead className="text-right">{t("units")}</TableHead>
                    <TableHead className="text-right">{t("spend")}</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">{t("share")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.data.byProduct.map((p) => (
                    <TableRow key={p.productId}>
                      <TableCell>
                        <Link href={`/buyer/products/${p.productId}`} className="font-medium hover:underline">
                          {p.productName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatNumber(p.units)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(p.spend)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right font-mono text-muted-foreground tabular-nums">
                        {formatPercent(Math.round((p.spend / summary.data.totalSpend) * 1000) / 10)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
