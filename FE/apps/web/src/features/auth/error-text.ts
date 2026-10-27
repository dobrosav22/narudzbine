"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { fieldProblemMsg, isApiError } from "@repo/core";
import { useErrorText } from "@/lib/i18n";

/** Identity/organization screens use the shared problem-code mapping (identity codes live in `problems.codes`). */
export { useErrorText as useIdErrorText };

/** Field-level message for a 422 field error at a JSON-pointer path (`/newPassword`, `/registeredAddress/city`). */
export function useFieldErrorText() {
  const t = useTranslations();
  return useCallback(
    (error: unknown, path: string): string | undefined => {
      if (!isApiError(error)) return undefined;
      const msg = fieldProblemMsg(error.fieldCode(path.replace(/^\//, "")));
      return msg ? (t as unknown as (k: string) => string)(msg.key) : undefined;
    },
    [t],
  );
}
