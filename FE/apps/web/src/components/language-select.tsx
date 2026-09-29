"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SUPPORTED_LOCALES, type AppLocale } from "@repo/core";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeLocale, useErrorText, useUiLocale } from "@/lib/i18n";

/**
 * 05 §6 language switcher: a plain select with text labels ("English" / "Srpski"), no flags.
 * Signed in, the choice is saved as the person's preferredLocale; signed out, it's remembered
 * for this browser until someone logs in.
 */
export function LanguageSelect({ id, className }: { id?: string; className?: string }) {
  const t = useTranslations();
  const locale = useUiLocale();
  const errorText = useErrorText();
  const [saving, setSaving] = useState(false);
  return (
    <Select
      value={locale}
      disabled={saving}
      onValueChange={(v) => {
        setSaving(true);
        changeLocale(v as AppLocale)
          .catch((e: unknown) => toast.error(errorText(e)))
          .finally(() => setSaving(false));
      }}
    >
      <SelectTrigger id={id} className={className ?? "w-40"} aria-label={t("common.language")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {SUPPORTED_LOCALES.map((l) => (
            // Each name in its own language, so it's findable whichever language is showing.
            <SelectItem key={l.value} value={l.value} lang={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
