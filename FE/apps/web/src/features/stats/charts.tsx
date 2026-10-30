"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { useTranslations } from "next-intl";
import { formatLocalDate, formatMoney, formatMonth, formatNumber, type Currency, type ReportBucket, type ReportGrouping } from "@repo/core";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

/** Long label for one bucket: a full date per day, "October 2026" per month. */
export function bucketLabel(periodStart: string, grouping: ReportGrouping): string {
  return grouping === "DAY" ? formatLocalDate(periodStart) : formatMonth(periodStart, "long");
}

/** Short axis tick: the day of month per day, the short month name per month. */
function tick(periodStart: string, grouping: ReportGrouping): string {
  return grouping === "DAY" ? formatNumber(Number(periodStart.slice(8, 10))) : formatMonth(periodStart);
}

/**
 * Goods total per period, one series on the chart-2 token (no legend: the card title names it).
 * Zero-filled buckets come from the backend, so the axis never skips. Amounts stay decimal
 * strings for display; recharts only gets a number for bar height.
 */
export function PeriodChart({
  buckets,
  grouping,
  currency,
  label,
  className,
}: {
  buckets: ReportBucket[];
  grouping: ReportGrouping;
  currency: Currency;
  label: string;
  className?: string;
}) {
  const t = useTranslations("stats");
  const config = { total: { label, color: "var(--chart-2)" } } satisfies ChartConfig;
  const rows = buckets.map((b) => ({ ...b, total: Number(b.goodsTotal) }));
  return (
    <ChartContainer
      config={config}
      className={className ?? "aspect-auto h-56 w-full"}
      role="img"
      aria-label={`${t("chartAria", { label })}: ${buckets
        .filter((b) => b.orderCount > 0)
        .map((b) => `${bucketLabel(b.periodStart, grouping)} ${formatMoney(b.goodsTotal, currency)}`)
        .join(", ")}`}
    >
      <BarChart data={rows} accessibilityLayer margin={{ left: 4, right: 4 }} barCategoryGap={rows.length > 31 ? 0 : "10%"}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="periodStart"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={12}
          tickFormatter={(v: string) => tick(v, grouping)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(v) => bucketLabel(String(v), grouping)}
              formatter={(_value, _name, item) => {
                const bucket = item.payload as ReportBucket;
                return (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatMoney(bucket.goodsTotal, currency)}
                      <span className="ml-2 text-muted-foreground">
                        {t("orders", { count: bucket.orderCount, countText: formatNumber(bucket.orderCount) })}
                      </span>
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        {/* Many days on a narrow screen give bars a few px wide: a 4 px corner radius hides them. */}
        <Bar dataKey="total" fill="var(--color-total)" radius={rows.length > 31 ? 0 : 4} />
      </BarChart>
    </ChartContainer>
  );
}
