"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { codePointLength, isValidText, REASON_MAX } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ActionError } from "./action-error";

/**
 * Asks for the required plain-text reason (1–1000 code points) of a rejection, cancellation or
 * cancellation request/denial. The text is kept while the dialog is open so an exact retry after
 * an uncertain outcome resends the same body (natural action identity).
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string) => void;
}) {
  const t = useTranslations("orders.reason");
  const tc = useTranslations("common");
  const [reason, setReason] = useState("");
  const valid = isValidText(reason, REASON_MAX);
  const length = codePointLength(reason.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !pending) onConfirm(reason);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={length > REASON_MAX || undefined}>
            <FieldLabel htmlFor="order-reason">{t("label")}</FieldLabel>
            <Textarea id="order-reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus required />
            <FieldDescription>{t("count", { count: length, max: REASON_MAX })}</FieldDescription>
          </Field>
          <ActionError error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={!valid || pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
