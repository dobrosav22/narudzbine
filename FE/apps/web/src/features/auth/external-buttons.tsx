"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EXTERNAL_PROVIDERS, startExternalAuthentication, type ExternalProvider } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "./form-error";

/**
 * Google/Apple providers offered on this deployment. Both are offered unless
 * NEXT_PUBLIC_EXTERNAL_LOGIN_PROVIDERS narrows the list ("GOOGLE", "GOOGLE,APPLE", or "" for none);
 * actual provider activation is a backend/provider gate (G-02).
 */
export function enabledExternalProviders(): ExternalProvider[] {
  const configured = process.env.NEXT_PUBLIC_EXTERNAL_LOGIN_PROVIDERS;
  if (configured === undefined) return [...EXTERNAL_PROVIDERS];
  return EXTERNAL_PROVIDERS.filter((p) => configured.split(",").map((s) => s.trim().toUpperCase()).includes(p));
}

/**
 * Browser OIDC start: the backend binds the flow to an HttpOnly cookie and returns the provider
 * URL; the provider callback lands on the backend, which sets the session cookie and redirects to
 * the configured web address (the app then restores the session from the cookie). LOGIN never
 * signs up or links by email; LINK needs a recent password confirmation (guarded by the caller).
 */
export function ExternalButtons({ purpose, guard }: { purpose: "LOGIN" | "LINK"; guard?: <T>(action: () => Promise<T>) => Promise<T> }) {
  const t = useTranslations("auth.external");
  const [pending, setPending] = useState<ExternalProvider | null>(null);
  const [error, setError] = useState<unknown>(null);
  const providers = enabledExternalProviders();
  if (providers.length === 0) return null;

  async function start(provider: ExternalProvider) {
    setPending(provider);
    setError(null);
    try {
      const run = () => startExternalAuthentication({ provider, purpose, transport: "BROWSER", returnTarget: "WEB", codeChallenge: null });
      const challenge = guard ? await guard(run) : await run();
      window.location.assign(challenge.authorizationUrl);
    } catch (e) {
      setError(e);
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FormError error={error} />
      {providers.map((provider) => (
        <Button key={provider} type="button" variant="outline" disabled={pending !== null} onClick={() => void start(provider)}>
          {pending === provider && <Spinner data-icon="inline-start" />}
          {pending === provider ? t("redirecting") : t(purpose === "LOGIN" ? provider : (`link${provider}` as const))}
        </Button>
      ))}
    </div>
  );
}
