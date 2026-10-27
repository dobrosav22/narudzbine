"use client";

import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useIdErrorText } from "./error-text";

/** Form-level error from a failed API call, in the UI language (backend problem code → text). */
export function FormError({ error }: { error: unknown }) {
  const errorText = useIdErrorText();
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertDescription>{errorText(error)}</AlertDescription>
    </Alert>
  );
}
