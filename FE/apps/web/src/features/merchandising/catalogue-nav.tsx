"use client";

import { useTranslations } from "next-intl";
import { SectionNav } from "@/components/section-nav";

/** Catalogue sub-pages: products, featured, promotions, inventory, taxonomy and CSV import. */
export function CatalogueNav() {
  const t = useTranslations("merch.nav");
  return (
    <SectionNav
      label={t("label")}
      sections={[
        { href: "/vendor/catalogue", label: t("products") },
        { href: "/vendor/catalogue/featured", label: t("featured") },
        { href: "/vendor/catalogue/promotions", label: t("promotions") },
        { href: "/vendor/catalogue/inventory", label: t("inventory") },
        { href: "/vendor/catalogue/taxonomy", label: t("taxonomy") },
        { href: "/vendor/catalogue/import", label: t("import") },
      ]}
    />
  );
}
