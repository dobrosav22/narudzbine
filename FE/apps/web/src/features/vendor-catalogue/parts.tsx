"use client";

import { useCallback } from "react";
import Link from "next/link";
import { AlertCircleIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { assetContentUrl, catalogueProblemMsg, formatNumber, type VendorPlan } from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMsg } from "@/lib/i18n";

export const PLAN_HREF = "/vendor/settings/plan";

/** Error text for catalogue, pricing, media and inventory calls (adds this area's problem codes). */
export function useCatalogueErrorText() {
  const tm = useMsg();
  return useCallback((error: unknown) => tm(catalogueProblemMsg(error)), [tm]);
}

export function CatalogueFormError({ error }: { error: unknown }) {
  const errorText = useCatalogueErrorText();
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>{errorText(error)}</AlertDescription>
    </Alert>
  );
}

/** Shown when the plan's non-archived product limit is reached (or the backend says so). */
export function PlanLimitAlert({ plan }: { plan: VendorPlan | undefined }) {
  const t = useTranslations("vendorCatalogue.planLimit");
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription>{t("description", { limit: plan ? formatNumber(plan.plan.productLimit) : "—" })}</AlertDescription>
      <AlertAction>
        <Button asChild size="sm" variant="outline">
          <Link href={PLAN_HREF}>{t("link")}</Link>
        </Button>
      </AlertAction>
    </Alert>
  );
}

const STATE_BADGE = { ACTIVE: "success", INACTIVE: "secondary", ARCHIVED: "outline" } as const;

export function ProductStateBadge({ state }: { state: keyof typeof STATE_BADGE }) {
  const t = useTranslations("vendorCatalogue.state");
  return <Badge variant={STATE_BADGE[state]}>{t(state)}</Badge>;
}

/** A product's main gallery image (authenticated content URL; the session cookie authorizes it). */
export function ProductThumb({ assetId, className, alt }: { assetId: string | undefined; className: string; alt?: string }) {
  return <ProductImage src={assetId ? assetContentUrl(assetId) : undefined} alt={alt} className={className} />;
}
