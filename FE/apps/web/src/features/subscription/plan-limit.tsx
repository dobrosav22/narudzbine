"use client";

import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { limitMessage, type PlanLimit, type VendorPlan } from "@repo/core";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

export const PLAN_SETTINGS_HREF = "/vendor/settings/plan";

/**
 * v1.1 hard block (01 §2, 02 "Tier limit enforcement"): shown beside a disabled Add Product /
 * Invite control. No self-serve upgrade — the way forward is a request on Subscription & Billing.
 */
export function PlanLimitNotice({ plan, limit }: { plan: VendorPlan; limit: PlanLimit }) {
  const t = useTranslations("planLimit");
  const tm = useMsg();
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertTitle>{t(limit === "products" ? "titleProducts" : "titleBuyers")}</AlertTitle>
      <AlertDescription>{limitMessage(plan, limit).map(tm).join(" ")}</AlertDescription>
      <AlertAction>
        <Button asChild size="sm" variant="outline">
          <Link href={PLAN_SETTINGS_HREF}>{t("link")}</Link>
        </Button>
      </AlertAction>
    </Alert>
  );
}
