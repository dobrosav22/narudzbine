"use client";

import { useState } from "react";
import { MailPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { fieldProblemMsg, isApiError, type Invitation } from "@repo/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PlanLimitNotice } from "@/features/subscription/plan-limit";
import { useErrorText, useMsg } from "@/lib/i18n";
import { ProblemAlert } from "./parts";
import { useInviteBuyer } from "./queries";

/** Errors that belong under the email field rather than above the form. */
function emailError(error: unknown, errorText: (e: unknown) => string, tm: ReturnType<typeof useMsg>): string | undefined {
  if (!isApiError(error)) return undefined;
  if (error.code === "ALREADY_CONNECTED") return errorText(error);
  const code = error.fieldCode("recipientEmail");
  if (!code) return undefined;
  const message = fieldProblemMsg(code);
  return message ? tm(message) : errorText(error);
}

/**
 * The email form both invite paths share. `buyerOrganizationId: null` sets up a NEW buyer
 * business; a formerly connected buyer's id sends a TRADING (reconnection) invitation that its
 * owner/admin accepts. Inviting reserves no plan capacity: the cap is checked on acceptance, but
 * the backend may still answer PLAN_LIMIT_EXCEEDED / PLAN_REQUIRED, shown with the plan link.
 */
export function InviteEmailForm({
  formId,
  buyerOrganizationId,
  onSent,
}: {
  formId: string;
  buyerOrganizationId: string | null;
  onSent: (invitation: Invitation) => void;
}) {
  const t = useTranslations("vendorBuyers.invite");
  const errorText = useErrorText();
  const tm = useMsg();
  const [email, setEmail] = useState("");
  const invite = useInviteBuyer();
  const planProblem = isApiError(invite.error, "PLAN_LIMIT_EXCEEDED") || isApiError(invite.error, "PLAN_REQUIRED");
  const fieldError = emailError(invite.error, errorText, tm);

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        const recipientEmail = email.trim();
        if (!recipientEmail) return;
        invite.mutate(
          { recipientEmail, buyerOrganizationId },
          {
            onSuccess: (invitation) => {
              setEmail("");
              onSent(invitation);
            },
          },
        );
      }}
    >
      <FieldGroup>
        {planProblem && <PlanLimitNotice limit="buyers" />}
        {invite.error && !planProblem && !fieldError && <ProblemAlert error={invite.error} />}
        <Field data-invalid={!!fieldError || undefined}>
          <FieldLabel htmlFor={`${formId}-email`}>{t("email")}</FieldLabel>
          <Input
            id={`${formId}-email`}
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            value={email}
            aria-invalid={!!fieldError || undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (invite.error) invite.reset();
            }}
          />
          {fieldError ? <FieldError>{fieldError}</FieldError> : <FieldDescription>{t(buyerOrganizationId ? "emailHintReconnect" : "emailHint")}</FieldDescription>}
        </Field>
        <Button type="submit" className="self-start" disabled={!email.trim() || invite.isPending}>
          {invite.isPending && <Spinner data-icon="inline-start" />}
          {t("send")}
        </Button>
      </FieldGroup>
    </form>
  );
}

/** Vendor owner/admin invites a new buyer business by email (setup invitation). */
export function InviteBuyerDialog({ onSent }: { onSent?: () => void }) {
  const t = useTranslations("vendorBuyers.invite");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Invitation>();
  const close = () => {
    setOpen(false);
    setSent(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button>
          <MailPlusIcon data-icon="inline-start" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sent ? t("sentTitle") : t("title")}</DialogTitle>
          <DialogDescription>{sent ? t("sentDescription", { email: sent.recipientEmail }) : t("description")}</DialogDescription>
        </DialogHeader>
        {!sent && <InviteEmailForm formId="invite-buyer" buyerOrganizationId={null} onSent={(i) => (setSent(i), onSent?.())} />}
        <DialogFooter>
          {sent ? (
            <>
              <Button variant="outline" onClick={() => setSent(undefined)}>
                {t("another")}
              </Button>
              <Button onClick={close}>{tc("done")}</Button>
            </>
          ) : (
            <Button variant="outline" onClick={close}>
              {tc("cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
