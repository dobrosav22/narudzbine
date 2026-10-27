"use client";

import { useTranslations } from "next-intl";
import { orderStateTone, type OrderState } from "@repo/core";
import { Badge } from "@/components/ui/badge";

/**
 * Core lifecycle state (fixed backend states, translated) plus the vendor's optional custom
 * stage label inside ACCEPTED — e.g. "Accepted · Packing". Semantic tones, never purple (05 §1).
 */
export function OrderStateBadge({ state, stageName }: { state: OrderState; stageName?: string | null }) {
  const t = useTranslations("ordState");
  const label = state === "ACCEPTED" && stageName ? t("withStage", { state: t(state), stage: stageName }) : t(state);
  return <Badge variant={orderStateTone(state)}>{label}</Badge>;
}
