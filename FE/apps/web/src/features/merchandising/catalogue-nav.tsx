"use client";

import { SectionNav } from "@/components/section-nav";
import { useTranslations } from "next-intl";

/**
 * [assumed] 03 lists "Featured & Promotions" as a vendor screen but the nav shape has
 * no slot for it; it lives as sections of Catalogue.
 */
export function CatalogueNav() {
  const t = useTranslations("merch.nav");
  return (
    <SectionNav
      label={t("label")}
      sections={[
        { href: "/vendor/catalogue", label: t("products") },
        { href: "/vendor/catalogue/featured", label: t("featured") },
        { href: "/vendor/catalogue/promotions", label: t("promotions") },
      ]}
    />
  );
}
