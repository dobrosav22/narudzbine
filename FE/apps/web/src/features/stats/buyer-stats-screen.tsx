"use client";

import { useTranslations } from "next-intl";
import { formatDate, formatMoney, formatNumber, reportHasActivity, type ReportExportKind } from "@repo/core";
import { ErrorState } from "@/components/query-states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBusiness } from "@/lib/session";
import { PeriodChart } from "./charts";
import { ExportJobs, ExportMenu, useExports } from "./export-panel";
import { useReportSummary } from "./queries";
import { RangePicker, rangeText, StatCard, useReportRange } from "./stat-parts";
import { orderAverage, ProductTable, SummarySkeleton } from "./vendor-stats-screen";

/** The buyers report is vendor-only; buyers export their orders and product report. */
const BUYER_EXPORTS: readonly ReportExportKind[] = ["ORDERS", "REPORT_PRODUCTS"];

/**
 * Buyer → Stats: this business's delivered purchases across all its vendors in the chosen
 * range. The reports have no vendor or location filter (see gaps).
 */
export function BuyerStatsScreen() {
  const t = useTranslations("stats");
  const { organization } = useBusiness();
  const { choice, setChoice, range } = useReportRange();
  const summary = useReportSummary(range);
  const exports = useExports();
  const currency = organization.currency;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("buyerBasis", { range: rangeText(range) })}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <RangePicker value={choice} onChange={setChoice} />
          <ExportMenu kinds={BUYER_EXPORTS} onPick={(kind) => exports.start(kind, { from: range.from, to: range.to })} />
        </div>
      </div>

      <ExportJobs jobs={exports.jobs} onRetry={exports.retry} onDismiss={exports.dismiss} />

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <SummarySkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label={t("spend")} value={formatMoney(summary.data.goodsTotal, currency)} footer={t("netNote")} />
            <StatCard label={t("ordersCol")} value={formatNumber(summary.data.orderCount)} />
            <StatCard label={t("averageOrder")} value={orderAverage(summary.data.goodsTotal, summary.data.orderCount, currency)} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{summary.data.grouping === "DAY" ? t("spendByDay") : t("spendByMonth")}</CardTitle>
              <CardDescription>{t("chartNote", { timezone: summary.data.timezone, asOf: formatDate(summary.data.asOf) })}</CardDescription>
            </CardHeader>
            <CardContent>
              {reportHasActivity(summary.data.buckets) ? (
                <PeriodChart buckets={summary.data.buckets} grouping={summary.data.grouping} currency={currency} label={t("spend")} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("byProduct")}</CardTitle>
          <CardDescription>{t("byProductBuyerNote")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductTable range={range} currency={currency} enabled />
        </CardContent>
      </Card>
    </div>
  );
}
