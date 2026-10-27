"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, ShieldAlertIcon } from "lucide-react";
import { acceptRecovery, isApiError, isUuid } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { FullPageSpinner } from "@/features/shell/guards";
import { sessionStore, useSession } from "@/lib/session";
import { FormError } from "./form-error";
import { useFragmentParams } from "./fragment";
import { useGuarded } from "./reauth";

/** The acceptance token survives the login round trip in this tab only (never in a URL). */
const TOKEN_KEY = "narudzbine.recoveryToken";

function rememberToken(token: string | undefined): string | null {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return token ?? null;
  }
}

function forgetToken() {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored.
  }
}

/**
 * `/recovery#case=…` (notice to old contacts, `/#/recovery/{caseId}`) or `/recovery#token=…`
 * (acceptance link, `/#/recovery-acceptance?token=…`). Acceptance needs the recovered account
 * signed in with a fresh password proof, and the case id — which the acceptance link doesn't
 * carry, so the person enters the reference the Narudžbine team gave them.
 */
export function RecoveryAcceptance() {
  const t = useTranslations("auth.recovery");
  const params = useFragmentParams(["token", "case"] as const);
  const state = useSession();
  const guarded = useGuarded();
  const [token, setToken] = useState<string | null>(null);
  const [caseId, setCaseId] = useState("");
  const accept = useMutation({
    mutationFn: (input: { caseId: string; token: string }) => guarded(() => acceptRecovery(input.caseId, input.token)),
    onSuccess: () => {
      forgetToken();
      void sessionStore.expire();
    },
  });

  useEffect(() => {
    // sessionStorage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params && !params.case) setToken(rememberToken(params.token));
  }, [params]);

  if (params === null) return <FullPageSpinner />;
  if (params.case) {
    return (
      <Card>
        <CardHeader>
          <ShieldAlertIcon className="size-6 text-destructive" aria-hidden />
          <CardTitle className="text-xl">{t("noticeTitle")}</CardTitle>
          <CardDescription>{t("noticeDescription", { caseId: params.case })}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (accept.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <CheckCircle2Icon className="size-6 text-primary" aria-hidden />
          <CardTitle className="text-xl">{t("doneTitle")}</CardTitle>
          <CardDescription>{t("doneDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("missingTitle")}</CardTitle>
          <CardDescription>{t("missingDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (state.status === "signedOut") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("signInFirst")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/login?next=%2Frecovery">{t("logIn")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
  const caseValid = isUuid(caseId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("acceptDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (caseValid) accept.mutate({ caseId: caseId.trim().toLowerCase(), token });
          }}
        >
          <FieldGroup>
            {accept.error && !isApiError(accept.error, "REAUTHENTICATION_REQUIRED") && <FormError error={accept.error} />}
            <Field data-invalid={(!!caseId && !caseValid) || undefined}>
              <FieldLabel htmlFor="recovery-case">{t("caseReference")}</FieldLabel>
              <Input id="recovery-case" autoComplete="off" value={caseId} onChange={(e) => setCaseId(e.target.value)} />
              {!!caseId && !caseValid ? <FieldError>{t("caseInvalid")}</FieldError> : <FieldDescription>{t("caseReferenceHint")}</FieldDescription>}
            </Field>
            <Button type="submit" disabled={!caseValid || accept.isPending}>
              {accept.isPending && <Spinner data-icon="inline-start" />}
              {t("accept")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
