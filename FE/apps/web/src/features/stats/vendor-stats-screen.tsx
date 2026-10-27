"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  averageAmount,
  formatDate,
  formatMoney,
  formatNumber,
  REPORT_EXPORT_KINDS,
  reportHasActivity,
  type Currency,
  type ReportRange,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pager } from "@/features/trading/parts";
import { useBusiness } from "@/lib/session";
import { PeriodChart } from "./charts";
import { ExportJobs, ExportMenu, useExports } from "./export-panel";
import { useBuyerReport, useProductReport, useReportSummary } from "./queries";
import { RangePicker, rangeText, StatCard, useReportRange } from "./stat-parts";

type View = "products" | "buyers";
const PAGE_SIZE = 25;

/**
 * Vendor → Stats: delivered orders in the chosen country-local range — totals, goods total per
 * day/month, and sales by product and by buyer. Net amounts excluding VAT, as frozen on orders.
 */
export function VendorStatsScreen() {
  const t = useTranslations("stats");
  const { organization } = useBusiness();
  const { choice, setChoice, range } = useReportRange();
  const [view, setView] = useState<View>("products");
  const summary = useReportSummary(range);
  const exports = useExports();
  const currency = organization.currency;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("basis", { range: rangeText(range) })}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <RangePicker value={choice} onChange={setChoice} />
          <ExportMenu kinds={REPORT_EXPORT_KINDS} onPick={(kind) => exports.start(kind, { from: range.from, to: range.to })} />
        </div>
      </div>

      <ExportJobs jobs={exports.jobs} onRetry={exports.retry} onDismiss={exports.dismiss} />

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <SummarySkeleton />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("goodsTotal")} value={formatMoney(summary.data.goodsTotal, currency)} footer={t("netNote")} />
            <StatCard label={t("ordersCol")} value={formatNumber(summary.data.orderCount)} />
            <StatCard label={t("averageOrder")} value={orderAverage(summary.data.goodsTotal, summary.data.orderCount, currency)} />
            <StatCard
              label={t("activeBuyers")}
              value={formatNumber(summary.data.activeBuyerCount ?? 0)}
              footer={t("activeBuyersNote")}
              href="/vendor/buyers"
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{summary.data.grouping === "DAY" ? t("totalByDay") : t("totalByMonth")}</CardTitle>
              <CardDescription>{t("chartNote", { timezone: summary.data.timezone, asOf: formatDate(summary.data.asOf) })}</CardDescription>
            </CardHeader>
            <CardContent>
              {reportHasActivity(summary.data.buckets) ? (
                <PeriodChart buckets={summary.data.buckets} grouping={summary.data.grouping} currency={currency} label={t("goodsTotal")} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList>
          <TabsTrigger value="products">{t("byProduct")}</TabsTrigger>
          <TabsTrigger value="buyers">{t("byBuyer")}</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductTable range={range} currency={currency} enabled={view === "products"} linkProducts />
        </TabsContent>
        <TabsContent value="buyers">
          <BuyerTable range={range} currency={currency} enabled={view === "buyers"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function orderAverage(goodsTotal: string, orderCount: number, currency: Currency): string {
  const average = averageAmount(goodsTotal, orderCount);
  return average === null ? "—" : formatMoney(average, currency);
}

export function SummarySkeleton() {
  const t = useTranslations("states");
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={t("loading")}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/** Sales by product, quantity first. Reused by the buyer's stats (no product links there: rows span vendors). */
export function ProductTable({
  range,
  currency,
  enabled,
  linkProducts = false,
}: {
  range: ReportRange;
  currency: Currency;
  enabled: boolean;
  linkProducts?: boolean;
}) {
  const t = useTranslations("stats");
  const [state, setState] = useState({ key: "", page: 0 });
  const key = `${range.from}/${range.to}`;
  const page = state.key === key ? state.page : 0;
  const report = useProductReport({ from: range.from, to: range.to, page, size: PAGE_SIZE }, enabled);

  if (report.isError) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  if (report.isPending) return <RowsSkeleton />;
  if (report.data.items.length === 0) return <EmptyState icon={BarChart3Icon} title={t("noSalesTitle")} description={t("noSalesDescription")} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border">
        <Table className="text-sm" aria-label={t("byProduct")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("product")}</TableHead>
              <TableHead className="text-right">{t("quantity")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("ordersCol")}</TableHead>
              <TableHead className="text-right">{t("goodsTotal")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.data.items.map((p) => (
              <TableRow key={p.productId}>
                <TableCell>
                  <div className="flex flex-col">
                    {linkProducts ? (
                      <Link href={`/vendor/catalogue/${p.productId}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{p.name}</span>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatNumber(p.quantity)} <span className="text-muted-foreground">{p.unitName}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right font-mono tabular-nums">{formatNumber(p.orderCount)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatMoney(p.goodsTotal, currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} size={PAGE_SIZE} total={report.data.total} itemCount={report.data.items.length} onPage={(p) => setState({ key, page: p })} />
    </div>
  );
}

function BuyerTable({ range, currency, enabled }: { range: ReportRange; currency: Currency; enabled: boolean }) {
  const t = useTranslations("stats");
  const [state, setState] = useState({ key: "", page: 0 });
  const key = `${range.from}/${range.to}`;
  const page = state.key === key ? state.page : 0;
  const report = useBuyerReport({ from: range.from, to: range.to, page, size: PAGE_SIZE }, enabled);

  if (report.isError) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  if (report.isPending) return <RowsSkeleton />;
  if (report.data.items.length === 0) return <EmptyState icon={BarChart3Icon} title={t("noBuyersTitle")} description={t("noBuyersDescription")} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border">
        <Table className="text-sm" aria-label={t("byBuyer")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("buyer")}</TableHead>
              <TableHead className="text-right">{t("ordersCol")}</TableHead>
              <TableHead className="text-right">{t("goodsTotal")}</TableHead>
              <TableHead className="hidden sm:table-cell text-right">{t("averageOrder")}</TableHead>
              <TableHead className="hidden md:table-cell text-right">{t("lastOrder")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.data.items.map((b) => (
              <TableRow key={b.buyerId}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{b.displayName}</span>
                    {!b.activeConnection && <Badge variant="secondary">{t("disconnected")}</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatNumber(b.orderCount)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatMoney(b.goodsTotal, currency)}</TableCell>
                <TableCell className="hidden sm:table-cell text-right font-mono tabular-nums">{orderAverage(b.goodsTotal, b.orderCount, currency)}</TableCell>
                <TableCell className="hidden md:table-cell text-right">{b.lastOrderAt ? formatDate(b.lastOrderAt) : t("noOrders")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} size={PAGE_SIZE} total={report.data.total} itemCount={report.data.items.length} onPage={(p) => setState({ key, page: p })} />
    </div>
  );
}
