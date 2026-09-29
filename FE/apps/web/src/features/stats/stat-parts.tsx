"use client";

import Link from "next/link";
import { STATS_PERIODS, type StatsPeriod } from "@repo/core";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

/** One headline number. Same look as the buyer-detail stat cards (Phase 5). */
export function StatCard({ label, value, footer, href }: { label: string; value: string; footer?: string; href?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {(footer || href) && (
        <CardFooter className="text-sm text-muted-foreground">
          {href ? (
            <Link href={href} className="hover:text-foreground hover:underline">
              {footer}
            </Link>
          ) : (
            footer
          )}
        </CardFooter>
      )}
    </Card>
  );
}

export function PeriodSelect({ value, onChange }: { value: StatsPeriod; onChange: (p: StatsPeriod) => void }) {
  const t = useTranslations("stats");
  const tm = useMsg();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as StatsPeriod)}>
      <SelectTrigger className="w-44" aria-label={t("period")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {STATS_PERIODS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {tm({ key: p.labelKey })}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Location filter; hidden by callers when there's only one location to pick. */
export function LocationSelect({
  value,
  onChange,
  locations,
  allLabel,
  ariaLabel,
}: {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  locations: { id: string; name: string }[];
  allLabel: string;
  ariaLabel: string;
}) {
  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? undefined : v)}>
      <SelectTrigger className="w-52" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">{allLabel}</SelectItem>
          {locations.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
