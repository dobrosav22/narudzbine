"use client";

import { AlertCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { isApiError, isUncertainOutcome } from "@repo/core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useErrorText } from "@/lib/i18n";

/**
 * A failed order action. Conflicts mean the order changed meanwhile (the detail is refetched);
 * an uncertain outcome may be retried with the exact same action, which the backend replays.
 */
export function ActionError({ error }: { error: unknown }) {
  const t = useTranslations("orders");
  const errorText = useErrorText();
  if (!error) return null;
  const stale = isApiError(error, "REVISION_CONFLICT") || isApiError(error, "INVALID_STATE");
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>
        {errorText(error)} {stale ? t("staleNote") : isUncertainOutcome(error) ? t("uncertainNote") : null}
      </AlertDescription>
    </Alert>
  );
}
