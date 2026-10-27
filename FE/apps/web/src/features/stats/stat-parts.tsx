"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  customReportRange,
  DEFAULT_REPORT_RANGE,
  formatLocalDate,
  localToday,
  presetReportRange,
  REPORT_RANGE_PRESETS,
  reportRangeProblem,
  type ReportRangePreset,
  type ReportSummaryRange,
} from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** One headline number. */
export function StatCard({ label, value, footer, href }: { label: string; value: string; footer?: string; href?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {footer && (
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

type RangeChoice = { preset: ReportRangePreset } | { custom: ReportSummaryRange };

/** The selected report range: a preset ending today (country-local) or an applied custom range. */
export function useReportRange(initial: ReportRangePreset = DEFAULT_REPORT_RANGE) {
  const [choice, setChoice] = useState<RangeChoice>({ preset: initial });
  const range = "preset" in choice ? presetReportRange(choice.preset, localToday()) : choice.custom;
  return { choice, setChoice, range };
}

/** "1. okt 2026. – 25. okt 2026." */
export function rangeText(range: { from: string; to: string }): string {
  return `${formatLocalDate(range.from)} – ${formatLocalDate(range.to)}`;
}

/** Preset select, plus from/to dates when "Custom" is chosen (validated before it applies). */
export function RangePicker({ value, onChange }: { value: RangeChoice; onChange: (choice: RangeChoice) => void }) {
  const t = useTranslations("dateRanges");
  const [editing, setEditing] = useState("custom" in value);
  const current = "preset" in value ? presetReportRange(value.preset, localToday()) : value.custom;
  const [from, setFrom] = useState(current.from);
  const [to, setTo] = useState(current.to);
  const today = localToday();
  const problem = reportRangeProblem({ from, to }, today);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        value={editing ? "custom" : "preset" in value ? value.preset : "custom"}
        onValueChange={(v) => {
          if (v === "custom") {
            setEditing(true);
            return;
          }
          setEditing(false);
          onChange({ preset: v as ReportRangePreset });
        }}
      >
        <SelectTrigger className="w-44" aria-label={t("label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {REPORT_RANGE_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`preset.${p}`)}
              </SelectItem>
            ))}
            <SelectItem value="custom">{t("custom")}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {editing && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) onChange({ custom: customReportRange({ from, to }) });
          }}
        >
          <Field className="w-40" data-invalid={!!problem || undefined}>
            <FieldLabel htmlFor="range-from">{t("from")}</FieldLabel>
            <Input id="range-from" type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={!!problem || undefined} />
          </Field>
          <Field className="w-40" data-invalid={!!problem || undefined}>
            <FieldLabel htmlFor="range-to">{t("to")}</FieldLabel>
            <Input id="range-to" type="date" max={today} value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={!!problem || undefined} />
          </Field>
          <Button type="submit" variant="outline" disabled={!!problem}>
            {t("apply")}
          </Button>
          {problem && <FieldError className="basis-full">{t(`problem.${problem}`)}</FieldError>}
        </form>
      )}
    </div>
  );
}
