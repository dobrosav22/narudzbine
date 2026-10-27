"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon } from "lucide-react";
import { verifyEmailChangeProof } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { FullPageSpinner } from "@/features/shell/guards";
import { useSession } from "@/lib/session";
import { FormError } from "./form-error";
import { useFragmentParams } from "./fragment";

/**
 * `/email-change#token=…` (from `/#/email-proof?token=…`): confirms one mailbox of a pending
 * login-email change. It needs a click, so link scanners never confirm on their own. Completion
 * happens on the security page of the signed-in account.
 */
export function EmailProof() {
  const t = useTranslations("auth.emailProof");
  const params = useFragmentParams(["token"] as const);
  const state = useSession();
  const verify = useMutation({ mutationFn: (token: string) => verifyEmailChangeProof(token) });

  if (params === null) return <FullPageSpinner />;
  if (!params.token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("missingTitle")}</CardTitle>
          <CardDescription>{t("missingDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (verify.isSuccess) {
    const securityPath =
      state.status === "business"
        ? `/${state.organization.type === "VENDOR" ? "vendor" : "buyer"}/account/security`
        : state.status === "admin"
          ? "/admin/account/security"
          : "/login";
    return (
      <Card>
        <CardHeader>
          <CheckCircle2Icon className="size-6 text-primary" aria-hidden />
          <CardTitle className="text-xl">{t("doneTitle")}</CardTitle>
          <CardDescription>{t("doneDescription")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href={securityPath}>{t("openSecurity")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
  const token = params.token;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormError error={verify.error} />
        <Button onClick={() => verify.mutate(token)} disabled={verify.isPending}>
          {verify.isPending && <Spinner data-icon="inline-start" />}
          {t("submit")}
        </Button>
      </CardContent>
    </Card>
  );
}
