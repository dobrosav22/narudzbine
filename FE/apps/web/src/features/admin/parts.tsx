"use client";

import { formatNumber } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/** "10 / 10" with a warning at the limit and a destructive badge over it (the vendor is hard-blocked either way). */
export function UsageCell({ used, max, label }: { used: number; max: number; label: string }) {
  const t = useTranslations("admin");
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <span className="font-mono tabular-nums" aria-label={t("usageAria", { label, used: formatNumber(used), max: formatNumber(max) })}>
        {formatNumber(used)} / {formatNumber(max)}
      </span>
      {used > max ? <Badge variant="destructive">{t("overLimit")}</Badge> : used >= max ? <Badge variant="warning">{t("atLimit")}</Badge> : null}
    </span>
  );
}

export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <InputGroup className="sm:max-w-xs">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label} />
    </InputGroup>
  );
}

/** Case- and diacritic-insensitive match ("cafe" finds "Café Lipa"). */
export function matches(text: string, query: string): boolean {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return fold(text).includes(fold(query.trim()));
}
