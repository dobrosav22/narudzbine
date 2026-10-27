"use client";

import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { limitMsgs, type PlanLimitKind, type VendorPlan } from "@repo/core";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMsg } from "@/lib/i18n";

export const PLAN_SETTINGS_HREF = "/vendor/settings/plan";

/**
 * Shown when a vendor is at a plan cap or the backend answered 409 PLAN_LIMIT_EXCEEDED
 * (`isApiError(error, 'PLAN_LIMIT_EXCEEDED')`). Message + link only: plan changes are requests
 * a platform admin approves, never self-serve. Pass the current plan (GET /organization/plan)
 * when it is at hand for the exact allowance; without it a generic message is shown.
 */
export function PlanLimitNotice({ limit, plan }: { limit: PlanLimitKind; plan?: VendorPlan | null }) {
  const t = useTranslations("planLimit");
  const tm = useMsg();
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertTitle>{t(limit === "products" ? "titleProducts" : "titleBuyers")}</AlertTitle>
      <AlertDescription>{plan ? limitMsgs(plan, limit).map(tm).join(" ") : t(limit === "products" ? "genericProducts" : "genericBuyers")}</AlertDescription>
      <AlertAction>
        <Button asChild size="sm" variant="outline">
          <Link href={PLAN_SETTINGS_HREF}>{t("link")}</Link>
        </Button>
      </AlertAction>
    </Alert>
  );
}
