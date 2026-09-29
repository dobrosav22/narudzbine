"use client";

import { CheckIcon, XCircleIcon } from "lucide-react";
import { statusLabel, trackerView, type VendorOrderStatusConfig } from "@repo/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

/**
 * Rendered from the vendor's configured statuses — no hardcoded stepper (01 §5).
 * Shared by the buyer and vendor order screens; progress uses the semantic
 * success colour, not purple (05 §1).
 */
export function StatusTracker({ config, statusKey }: { config: VendorOrderStatusConfig; statusKey: string }) {
  const t = useTranslations("orders");
  const tm = useMsg();
  const view = trackerView(config, statusKey);
  if (view.cancelled) {
    return (
      <Alert variant="destructive">
        <XCircleIcon />
        <AlertTitle>{tm(statusLabel(view.cancelled))}</AlertTitle>
        <AlertDescription>{t("cancelledNote")}</AlertDescription>
      </Alert>
    );
  }
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0" aria-label={t("progress")}>
      {view.steps.map(({ status, state }, i) => (
        <li key={status.key} className="flex flex-1 items-center gap-2 sm:flex-col sm:gap-2" aria-current={state === "current" ? "step" : undefined}>
          <div className="flex w-full items-center">
            {/* connector before (desktop) */}
            <div className={cn("hidden h-px flex-1 sm:block", i === 0 ? "invisible" : state === "upcoming" ? "bg-border" : "bg-success")} />
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                state === "done" && "border-success bg-success text-success-foreground",
                state === "current" && "border-success text-success",
                state === "upcoming" && "border-border text-muted-foreground",
              )}
            >
              {state === "done" ? <CheckIcon className="size-4" /> : i + 1}
            </span>
            <div className={cn("hidden h-px flex-1 sm:block", i === view.steps.length - 1 ? "invisible" : state === "done" ? "bg-success" : "bg-border")} />
          </div>
          <span className={cn("text-sm", state === "upcoming" ? "text-muted-foreground" : "font-medium")}>{tm(statusLabel(status))}</span>
        </li>
      ))}
    </ol>
  );
}
