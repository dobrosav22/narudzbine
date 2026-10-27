"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { passwordProblem } from "@repo/core";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** New password + confirmation with the 15–128 code point rule; the provider may still reject it (PASSWORD_REJECTED). */
export function usePasswordPair() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const problem = passwordProblem(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  return { password, setPassword, confirm, setConfirm, problem, mismatch, valid: !problem && confirm === password };
}

export function PasswordPairFields({
  pair,
  attempted,
  serverError,
  idPrefix,
  newLabel,
}: {
  pair: ReturnType<typeof usePasswordPair>;
  attempted: boolean;
  serverError?: string;
  idPrefix: string;
  newLabel?: string;
}) {
  const t = useTranslations("auth");
  const shownProblem = attempted && pair.problem ? t(pair.problem === "tooShort" ? "passwordTooShort" : "passwordTooLong") : serverError;
  const shownMismatch = (attempted || pair.mismatch) && pair.confirm !== pair.password ? t("passwordMismatch") : undefined;
  return (
    <>
      <Field data-invalid={!!shownProblem || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-password`}>{newLabel ?? t("newPassword")}</FieldLabel>
        <Input
          id={`${idPrefix}-password`}
          type="password"
          autoComplete="new-password"
          value={pair.password}
          aria-invalid={!!shownProblem || undefined}
          onChange={(e) => pair.setPassword(e.target.value)}
        />
        {shownProblem ? <FieldError>{shownProblem}</FieldError> : <FieldDescription>{t("passwordHint")}</FieldDescription>}
      </Field>
      <Field data-invalid={!!shownMismatch || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-confirm`}>{t("confirmPassword")}</FieldLabel>
        <Input
          id={`${idPrefix}-confirm`}
          type="password"
          autoComplete="new-password"
          value={pair.confirm}
          aria-invalid={!!shownMismatch || undefined}
          onChange={(e) => pair.setConfirm(e.target.value)}
        />
        {shownMismatch && <FieldError>{shownMismatch}</FieldError>}
      </Field>
    </>
  );
}
