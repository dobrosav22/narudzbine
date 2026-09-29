"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3Icon } from "lucide-react";
import {
  averageOrderValue,
  DEFAULT_STATS_PERIOD,
  formatDate,
  formatMoney,
  formatNumber,
  periodKey,
  type StatsPeriod,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVendorOrderContext } from "@/features/vendor-orders/queries";
import { Sparkline } from "./charts";
import { useBuyerStats, useProductStats } from "./queries";
import { LocationSelect, PeriodSelect } from "./stat-parts";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

type View = "products" | "buyers";

/**
 * 03 → vendor "Stats module": by product (units, revenue, trend) and by buyer
 * (frequency, spend, last order), both filtered by period and fulfilling warehouse.
 * Cancelled orders never count (mocks/stats.ts).
 */
export function VendorStatsScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("stats");
  const tm = useMsg();
  const [view, setView] = useState<View>("products");
  const [period, setPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD);
  const [locationId, setLocationId] = useState<string>();
  const filter = { period, locationId };
  const products = useProductStats(vendorOrgId, filter, view === "products");
  const buyers = useBuyerStats(vendorOrgId, filter, view === "buyers");
  const context = useVendorOrderContext(vendorOrgId);
  const warehouses = [...(context.data?.vendorLocations.values() ?? [])];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {tm({ key: periodKey(period) })}
            {locationId && ` · ${context.data?.vendorLocations.get(locationId)?.name ?? ""}`} · {t("cancelledExcluded")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PeriodSelect value={period} onChange={setPeriod} />
          {/* A single warehouse fulfils everything, so the filter would change nothing. */}
          {warehouses.length > 1 && (
            <LocationSelect
              value={locationId}
              onChange={setLocationId}
              locations={warehouses}
              allLabel={t("allWarehouses")}
              ariaLabel={t("filterWarehouse")}
            />
          )}
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList>
          <TabsTrigger value="products">{t("byProduct")}</TabsTrigger>
          <TabsTrigger value="buyers">{t("byBuyer")}</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          {products.isError ? (
            <ErrorState error={products.error} onRetry={() => void products.refetch()} />
          ) : products.isPending ? (
            <RowsSkeleton />
          ) : products.data.length === 0 ? (
            <EmptyState icon={BarChart3Icon} title={t("noSalesTitle")} description={t("noSalesDescription")} />
          ) : (
            <div className="rounded-lg border">
              <Table className="text-sm" aria-label={t("salesByProduct")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("product")}</TableHead>
                    <TableHead className="text-right">{t("units")}</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">{t("ordersCol")}</TableHead>
                    <TableHead className="text-right">{t("revenue")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("trend")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.data.map((p) => (
                    <TableRow key={p.productId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <Link href={`/vendor/catalogue/${p.productId}`} className="font-medium hover:underline">
                            {p.productName}
                          </Link>
                          <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatNumber(p.units)} <span className="text-muted-foreground">{p.unit}</span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right font-mono tabular-nums">{formatNumber(p.orderCount)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(p.revenue)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Sparkline buckets={p.trend} label={t("productTrend", { name: p.productName })} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>{t("total")}</TableCell>
                    <TableCell />
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(products.data.reduce((s, p) => s + p.revenue, 0))}
                    </TableCell>
                    <TableCell className="hidden md:table-cell" />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="buyers">
          {buyers.isError ? (
            <ErrorState error={buyers.error} onRetry={() => void buyers.refetch()} />
          ) : buyers.isPending ? (
            <RowsSkeleton />
          ) : buyers.data.length === 0 ? (
            <EmptyState icon={BarChart3Icon} title={t("noBuyersTitle")} description={t("noBuyersDescription")} />
          ) : (
            <div className="rounded-lg border">
              <Table className="text-sm" aria-label={t("salesByBuyer")}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("buyer")}</TableHead>
                    <TableHead className="text-right">{t("ordersCol")}</TableHead>
                    <TableHead className="text-right">{t("spend")}</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">{t("avgOrder")}</TableHead>
                    <TableHead className="hidden md:table-cell text-right">{t("lastOrder")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyers.data.map((b) => (
                    <TableRow key={b.buyerOrgId}>
                      <TableCell>
                        <Link href={`/vendor/buyers/${b.buyerOrgId}`} className="font-medium hover:underline">
                          {b.buyerName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatNumber(b.orderCount)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(b.spend)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right font-mono tabular-nums">
                        {b.orderCount ? formatMoney(averageOrderValue(b.spend, b.orderCount)) : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right">{b.lastOrderAt ? formatDate(b.lastOrderAt) : t("noOrders")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
