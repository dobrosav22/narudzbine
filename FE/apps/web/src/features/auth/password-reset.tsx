"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, MailCheckIcon } from "lucide-react";
import { completePasswordReset, isApiError, requestPasswordReset } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { FullPageSpinner } from "@/features/shell/guards";
import { sessionStore, useSession } from "@/lib/session";
import { useFieldErrorText } from "./error-text";
import { PasswordPairFields, usePasswordPair } from "./fields";
import { FormError } from "./form-error";
import { useFragmentParams } from "./fragment";

/** Public reset request: always the same generic answer, whether or not the address has an account. */
export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const request = useMutation({ mutationFn: () => requestPasswordReset(email.trim()) });

  if (request.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <MailCheckIcon className="size-6 text-primary" aria-hidden />
          <CardTitle className="text-xl">{t("forgot.sentTitle")}</CardTitle>
          <CardDescription>{t("forgot.sentDescription", { email: email.trim() })}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline">
            <Link href="/login">{t("backToLogin")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("forgot.title")}</CardTitle>
        <CardDescription>{t("forgot.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate();
          }}
        >
          <FieldGroup>
            <FormError error={request.error} />
            <Field>
              <FieldLabel htmlFor="reset-email">{t("email")}</FieldLabel>
              <Input id="reset-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" disabled={request.isPending || !email.trim()}>
              {request.isPending && <Spinner data-icon="inline-start" />}
              {t("forgot.submit")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
          {t("backToLogin")}
        </Link>
      </CardFooter>
    </Card>
  );
}

/** `/reset-password#token=…` (forwarded from the emailed `/#/password-reset?token=…`). */
export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const params = useFragmentParams(["token"] as const);
  const state = useSession();
  const pair = usePasswordPair();
  const [attempted, setAttempted] = useState(false);
  const fieldError = useFieldErrorText();
  const reset = useMutation({
    mutationFn: () => completePasswordReset(params!.token!, pair.password),
    // Reset revokes every session, including one open in this browser.
    onSuccess: () => (state.status === "signedOut" ? undefined : sessionStore.expire()),
  });

  if (params === null) return <FullPageSpinner />;
  if (!params.token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("reset.missingTitle")}</CardTitle>
          <CardDescription>{t("reset.missingDescription")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/forgot-password">{t("reset.requestNew")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
  if (reset.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <CheckCircle2Icon className="size-6 text-primary" aria-hidden />
          <CardTitle className="text-xl">{t("reset.doneTitle")}</CardTitle>
          <CardDescription>{t("reset.doneDescription")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/login">{t("goToLogin")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const tokenInvalid = isApiError(reset.error, "TOKEN_INVALID");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("reset.title")}</CardTitle>
        <CardDescription>{t("reset.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAttempted(true);
            if (pair.valid) reset.mutate();
          }}
        >
          <FieldGroup>
            {reset.error && !isApiError(reset.error, "PASSWORD_REJECTED") && <FormError error={reset.error} />}
            {tokenInvalid && (
              <Link href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
                {t("reset.requestNew")}
              </Link>
            )}
            <PasswordPairFields pair={pair} attempted={attempted} idPrefix="reset" serverError={fieldError(reset.error, "newPassword")} />
            <Button type="submit" disabled={reset.isPending || tokenInvalid}>
              {reset.isPending && <Spinner data-icon="inline-start" />}
              {t("reset.submit")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
