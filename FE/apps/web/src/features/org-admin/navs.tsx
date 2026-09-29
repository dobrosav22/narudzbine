"use client";

import type { OrgType } from "@repo/core";
import { SectionNav } from "@/components/section-nav";
import { useTranslations } from "next-intl";

/**
 * [assumed] 03's nav shape has one "Settings" item per side. Company details, order
 * statuses and the plan are its sections for vendors (Locations and Team have their own
 * nav items); buyers have no nav slot for Locations or Team, so theirs live here too.
 */
export function SettingsNav({ orgType }: { orgType: OrgType }) {
  const t = useTranslations("settings.nav");
  return orgType === "vendor" ? (
    <SectionNav
      label={t("label")}
      sections={[
        { href: "/vendor/settings", label: t("company") },
        { href: "/vendor/settings/statuses", label: t("statuses") },
        { href: "/vendor/settings/plan", label: t("plan") },
      ]}
    />
  ) : (
    <SectionNav
      label={t("label")}
      sections={[
        { href: "/buyer/settings", label: t("company") },
        { href: "/buyer/settings/locations", label: t("locations") },
        { href: "/buyer/settings/team", label: t("team") },
      ]}
    />
  );
}

/** Personal settings (per login, not per company): profile and notification preferences. */
export function AccountNav({ orgType }: { orgType: OrgType }) {
  const t = useTranslations("account.nav");
  return (
    <SectionNav
      label={t("label")}
      sections={[
        { href: `/${orgType}/account`, label: t("profile") },
        { href: `/${orgType}/account/notifications`, label: t("notifications") },
      ]}
    />
  );
}
