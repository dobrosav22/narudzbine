"use client";

import { CheckIcon, XCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { orderProgress, type OrderState } from "@repo/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * The fixed order lifecycle (submitted → accepted → dispatched → delivered). The vendor's custom
 * stage is a label under the Accepted step, not a step of its own. Shared by buyer and vendor
 * screens; progress uses the semantic success colour (05 §1).
 */
export function OrderProgress({ state, stageName, endedNote }: { state: OrderState; stageName: string | null; endedNote: string }) {
  const t = useTranslations("ordState");
  const view = orderProgress(state);
  if (view.ended) {
    return (
      <Alert variant="destructive">
        <XCircleIcon />
        <AlertTitle>{t(view.ended)}</AlertTitle>
        <AlertDescription>{endedNote}</AlertDescription>
      </Alert>
    );
  }
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0" aria-label={t("progress")}>
      {view.steps.map(({ state: step, progress }, i) => (
        <li key={step} className="flex flex-1 items-center gap-2 sm:flex-col sm:gap-2" aria-current={progress === "current" ? "step" : undefined}>
          <div className="flex w-full items-center">
            <div className={cn("hidden h-px flex-1 sm:block", i === 0 ? "invisible" : progress === "upcoming" ? "bg-border" : "bg-success")} />
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                progress === "done" && "border-success bg-success text-success-foreground",
                progress === "current" && "border-success text-success",
                progress === "upcoming" && "border-border text-muted-foreground",
              )}
            >
              {progress === "done" ? <CheckIcon className="size-4" /> : i + 1}
            </span>
            <div
              className={cn("hidden h-px flex-1 sm:block", i === view.steps.length - 1 ? "invisible" : progress === "done" ? "bg-success" : "bg-border")}
            />
          </div>
          <span className="flex flex-col sm:items-center">
            <span className={cn("text-sm", progress === "upcoming" ? "text-muted-foreground" : "font-medium")}>{t(`step.${step}`)}</span>
            {step === "ACCEPTED" && progress === "current" && stageName && <span className="text-xs text-muted-foreground">{stageName}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
