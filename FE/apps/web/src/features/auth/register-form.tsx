"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { formatMoney, formatNumber, services } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/query-states";
import { useUiLocale } from "@/lib/i18n";
import { sessionStore } from "@/lib/session";
import { FormError } from "./form-error";

/**
 * Vendor self-serve signup (03 → "Vendor onboarding", first two steps: sign up
 * + choose tier). Buyers never self-register — they arrive via a vendor invite.
 */
export function RegisterForm() {
  const t = useTranslations("auth");
  const tp = useTranslations("planText");
  const locale = useUiLocale();
  const router = useRouter();
  const tiers = useQuery({ queryKey: ["subscriptionTiers"], queryFn: () => services.subscription.listTiers() });
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });
  const [tierId, setTierId] = useState<string>();
  const selectedTier = tierId ?? tiers.data?.[0]?.id;
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const register = useMutation({
    // The language on screen now becomes the new account's preferredLocale (01 §12).
    mutationFn: () => services.auth.registerVendor({ ...form, subscriptionTierId: selectedTier ?? "", preferredLocale: locale }),
    onSuccess: async (session) => {
      await sessionStore.signIn(session);
      router.replace("/vendor/catalogue");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("register.title")}</CardTitle>
        <CardDescription>{t("register.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate();
          }}
        >
          <FieldGroup>
            <FormError error={register.error} />
            <Field>
              <FieldLabel htmlFor="orgName">{t("companyName")}</FieldLabel>
              <Input id="orgName" required autoComplete="organization" value={form.orgName} onChange={set("orgName")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="name">{t("yourName")}</FieldLabel>
              <Input id="name" required autoComplete="name" value={form.name} onChange={set("name")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">{t("register.workEmail")}</FieldLabel>
              <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Input
                id="password"
                type="password"
                required
                minLength={4}
                autoComplete="new-password"
                value={form.password}
                onChange={set("password")}
              />
            </Field>

            <FieldSet>
              <FieldLegend variant="label">{t("register.plan")}</FieldLegend>
              <FieldDescription>{t("register.planNote")}</FieldDescription>
              {tiers.isPending ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : tiers.isError ? (
                <ErrorState error={tiers.error} onRetry={() => void tiers.refetch()} />
              ) : (
                <RadioGroup value={selectedTier} onValueChange={setTierId}>
                  {tiers.data.map((tier) => (
                    <FieldLabel key={tier.id} htmlFor={`tier-${tier.id}`}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>{tp("perMonth", { plan: tier.name, price: formatMoney(tier.priceMonthly) })}</FieldTitle>
                          <FieldDescription>
                            {tp("limits", { products: formatNumber(tier.maxProducts), buyers: formatNumber(tier.maxBuyers) })}
                          </FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value={tier.id} id={`tier-${tier.id}`} />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              )}
            </FieldSet>

            <Button type="submit" disabled={register.isPending || !selectedTier}>
              {register.isPending && <Spinner data-icon="inline-start" />}
              {t("register.submit")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t("register.haveAccount")}{" "}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            {t("login.submit")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
