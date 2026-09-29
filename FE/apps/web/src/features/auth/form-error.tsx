"use client";

import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useErrorText } from "@/lib/i18n";

/** Form-level error from a failed service call (UNAUTHORIZED, CONFLICT, VALIDATION…), in the UI language. */
export function FormError({ error }: { error: unknown }) {
  const errorText = useErrorText();
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>{errorText(error)}</AlertDescription>
    </Alert>
  );
}
