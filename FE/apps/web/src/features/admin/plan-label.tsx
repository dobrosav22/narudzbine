"use client";

import { useTranslations } from "next-intl";
import { formatNumber, type PlanRevision } from "@repo/core";

/** "Starter · 10 products · 5 active buyers" (entitlements only; plans carry no price). */
export function usePlanText() {
  const t = useTranslations("admin.plan");
  return {
    name: (plan: Pick<PlanRevision, "code" | "revision" | "retired">) =>
      `${t(`code.${plan.code}`)}${plan.revision > 1 ? ` (v${plan.revision})` : ""}${plan.retired ? ` · ${t("retired")}` : ""}`,
    limits: (plan: Pick<PlanRevision, "productLimit" | "activeBuyerLimit">) =>
      t("limits", { products: formatNumber(plan.productLimit), buyers: formatNumber(plan.activeBuyerLimit) }),
  };
}
