"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, MailPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { invitePath, isServiceError, USE_MOCKS, type Invite } from "@repo/core";
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
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "@/features/auth/form-error";
import { PlanLimitNotice } from "@/features/subscription/plan-limit";
import { useVendorPlan } from "@/features/vendor-catalogue/queries";
import { useInviteBuyer } from "@/features/vendor-orders/queries";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/i18n";

/**
 * 01 §9 "Vendor invites a buyer org": email invite. At the plan's buyer limit
 * the service answers PLAN_LIMIT and the upgrade prompt appears here (01 §2).
 * v1.1: the trigger is disabled at the limit (`blocked`); the in-dialog notice only covers a
 * seat taken meanwhile (e.g. by a teammate), which the server still refuses.
 */
export function InviteBuyerDialog({ vendorOrgId, blocked }: { vendorOrgId: string; blocked: boolean }) {
  const t = useTranslations("vendorBuyers.invite");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<Invite>();
  const invite = useInviteBuyer(vendorOrgId);
  const usage = useVendorPlan(vendorOrgId);
  const planLimit = isServiceError(invite.error, "PLAN_LIMIT");
  const fieldError = isServiceError(invite.error, "VALIDATION") || isServiceError(invite.error, "CONFLICT") ? errorText(invite.error) : undefined;

  const reset = () => {
    setEmail("");
    setSent(undefined);
    invite.reset();
  };
  // Every way of closing (X, Escape, Cancel, Done) resets, so reopening starts fresh.
  const close = () => {
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button disabled={blocked}>
          <MailPlusIcon data-icon="inline-start" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sent ? t("sentTitle") : t("title")}</DialogTitle>
          <DialogDescription>
            {sent ? t("sentDescription", { email: sent.email }) : t("description")}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          USE_MOCKS && <InviteLink invite={sent} />
        ) : (
          <form
            id="invite-form"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate(email, { onSuccess: (i) => setSent(i) });
            }}
          >
            <FieldGroup>
              {planLimit && usage.data && <PlanLimitNotice plan={usage.data} limit="buyers" />}
              {invite.error && !planLimit && !fieldError && <FormError error={invite.error} />}
              <Field data-invalid={!!fieldError || undefined}>
                <FieldLabel htmlFor="invite-email">{t("email")}</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  autoComplete="off"
                  placeholder="purchasing@company.ba"
                  value={email}
                  aria-invalid={!!fieldError || undefined}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (invite.error) invite.reset();
                  }}
                />
                {fieldError ? <FieldError>{fieldError}</FieldError> : <FieldDescription>{t("emailHint")}</FieldDescription>}
              </Field>
            </FieldGroup>
          </form>
        )}

        <DialogFooter>
          {sent ? (
            <>
              <Button variant="outline" onClick={reset}>
                {t("another")}
              </Button>
              <Button onClick={close}>{tc("done")}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                {tc("cancel")}
              </Button>
              <Button type="submit" form="invite-form" disabled={!email || invite.isPending}>
                {invite.isPending && <Spinner data-icon="inline-start" />}
                {t("send")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** [assumed] Mock-only: no email is sent, so show the link that would be emailed. */
export function InviteLink({ invite }: { invite: Pick<Invite, "token"> }) {
  const t = useTranslations("vendorBuyers.invite");
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? invitePath(invite) : `${window.location.origin}${invitePath(invite)}`;
  return (
    <Field>
      <FieldLabel htmlFor={`invite-link-${invite.token}`}>{t("link")}</FieldLabel>
      <InputGroup>
        <InputGroupInput id={`invite-link-${invite.token}`} readOnly value={url} className="font-mono text-xs" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={t("copyAria")}
            onClick={() =>
              void navigator.clipboard
                ?.writeText(url)
                .then(() => {
                  setCopied(true);
                  toast.success(t("copied"));
                })
                .catch(() => toast.error(t("copyFailed")))
            }
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>{t("mockNote")}</FieldDescription>
    </Field>
  );
}
