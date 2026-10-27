"use client";

import { useTranslations } from "next-intl";
import { SUPPORTED_LOCALES, isAppLocale } from "@repo/core";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setGuestLocale, useUiLocale } from "@/lib/i18n";

/**
 * Language choice before login (text labels, no flags), remembered in this browser. Signed-in
 * people choose their language from the account menu, which saves it on their account.
 */
export function GuestLanguageSelect({ className }: { className?: string }) {
  const t = useTranslations("common");
  const locale = useUiLocale();
  return (
    <Select value={locale} onValueChange={(v) => isAppLocale(v) && setGuestLocale(v)}>
      <SelectTrigger className={className ?? "w-40"} aria-label={t("language")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {SUPPORTED_LOCALES.map((l) => (
            <SelectItem key={l.value} value={l.value} lang={l.value}>
              {l.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
