"use client";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { formatMoney, formatMonth, formatNumber, type PeriodBucket } from "@repo/core";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useTranslations } from "next-intl";

/**
 * Month-by-month bars for revenue (vendor) or spend (buyer). Months come from the
 * service with empty ones filled in, so the axis never skips. The chart-* tokens are
 * the violet ramp from 05; chart-2 has enough contrast on both themes.
 */
export function MonthlyChart({
  buckets,
  label,
  className,
}: {
  buckets: PeriodBucket[];
  /** "Revenue" or "Spend" — tooltip and accessible name. */
  label: string;
  className?: string;
}) {
  const t = useTranslations("stats");
  const config = { revenue: { label, color: "var(--chart-2)" } } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className={className ?? "aspect-auto h-56 w-full"}
      role="img"
      aria-label={`${t("byMonthAria", { label })}: ${buckets.map((b) => `${formatMonth(b.period, "long")} ${formatMoney(b.revenue)}`).join(", ")}`}
    >
      <BarChart data={buckets} accessibilityLayer margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(v: string) => formatMonth(v)} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(v) => formatMonth(String(v), "long")}
              formatter={(value, _name, item) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatMoney(Number(value))}
                    <span className="ml-2 text-muted-foreground">
                      {t("orders", { count: (item.payload as PeriodBucket).orderCount, countText: formatNumber((item.payload as PeriodBucket).orderCount) })}
                    </span>
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

/** Tiny per-row trend (no axes, no tooltip); the row's own numbers carry the detail. */
export function Sparkline({ buckets, label }: { buckets: PeriodBucket[]; label: string }) {
  const config = { revenue: { label, color: "var(--chart-2)" } } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-7 w-24"
      role="img"
      aria-label={`${label}: ${buckets.map((b) => `${formatMonth(b.period)} ${formatMoney(b.revenue)}`).join(", ")}`}
    >
      <BarChart data={buckets} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={2} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
