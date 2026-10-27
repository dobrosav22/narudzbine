"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { homeFor, sessionStore } from "@/lib/session";
import { ExternalButtons, enabledExternalProviders } from "./external-buttons";
import { FormError } from "./form-error";

/** Only same-site paths — never let ?next= become an open redirect. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Browser login fetches a fresh single-use bootstrap nonce per attempt (inside sessionStore.login).
  const login = useMutation({
    mutationFn: () => sessionStore.login({ email, password }),
    onSuccess: (state) => router.replace(next ?? homeFor(state)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("login.title")}</CardTitle>
        <CardDescription>{t("login.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <FieldGroup>
            <FormError error={login.error} />
            <Field>
              <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
                <Link href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
                  {t("login.forgot")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={login.isPending || !email || !password}>
              {login.isPending && <Spinner data-icon="inline-start" />}
              {t("login.submit")}
            </Button>
          </FieldGroup>
        </form>
        {enabledExternalProviders().length > 0 && (
          <>
            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">{t("login.or")}</FieldSeparator>
            <ExternalButtons purpose="LOGIN" />
          </>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-center text-sm text-muted-foreground">{t("login.noAccount")}</p>
      </CardFooter>
    </Card>
  );
}
