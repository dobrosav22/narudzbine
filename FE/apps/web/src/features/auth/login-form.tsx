"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { DEMO_ACCOUNTS, MOCK_PASSWORD, services, USE_MOCKS } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { homeFor, sessionStore } from "@/lib/session";
import { FormError } from "./form-error";

/** Only same-site paths — never let ?next= become an open redirect. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => services.auth.login({ email, password }),
    onSuccess: async (session) => {
      await sessionStore.signIn(session);
      router.replace(next ?? homeFor(sessionStore.getState()));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("login.title")}</CardTitle>
        <CardDescription>{t("login.description")}</CardDescription>
      </CardHeader>
      <CardContent>
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
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={login.isPending}>
              {login.isPending && <Spinner data-icon="inline-start" />}
              {t("login.submit")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-4">
        <p className="text-center text-sm text-muted-foreground">
          {t("login.selling")}{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            {t("login.createVendor")}
          </Link>
        </p>
        {USE_MOCKS && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                {t("login.demoAccounts")} <span className="font-mono">{MOCK_PASSWORD}</span>
              </p>
              {DEMO_ACCOUNTS.map((a) => (
                <Button
                  key={a.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto justify-start py-1.5 text-left whitespace-normal"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(MOCK_PASSWORD);
                  }}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{a.email}</span>
                    <span className="text-xs text-muted-foreground">{a.label}</span>
                  </span>
                </Button>
              ))}
            </div>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
