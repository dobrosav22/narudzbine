"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MailXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { isServiceError, services, type InvitePreview } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState } from "@/components/query-states";
import { useUiLocale } from "@/lib/i18n";
import { homePath, sessionStore } from "@/lib/session";
import { FormError } from "./form-error";

/**
 * 03 → "Invite acceptance". Three forms from one screen:
 *  - buyer_org_invite, new email → create BuyerOrg + first user + default Location
 *  - team_member_invite, new email → name + password
 *  - any invite to an email that already has an account → password only
 */
export function InviteAccept({ token }: { token: string }) {
  const t = useTranslations("auth.invite");
  const ta = useTranslations("auth");
  const preview = useQuery({ queryKey: ["invite", token], queryFn: () => services.invites.getByToken(token) });

  if (preview.isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (preview.isError) {
    return isServiceError(preview.error, "NOT_FOUND") ? (
      <EmptyState
        icon={MailXIcon}
        title={t("invalidTitle")}
        description={t("invalidDescription")}
      />
    ) : (
      <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
    );
  }
  if (preview.data.invite.status !== "pending") {
    return (
      <EmptyState
        icon={MailXIcon}
        title={t("usedTitle", { status: preview.data.invite.status })}
        description={t("usedDescription")}
      >
        <Button asChild>
          <Link href="/login">{ta("login.submit")}</Link>
        </Button>
      </EmptyState>
    );
  }
  return <InviteForm token={token} preview={preview.data} />;
}

function InviteForm({ token, preview }: { token: string; preview: InvitePreview }) {
  const t = useTranslations("auth.invite");
  const ta = useTranslations("auth");
  const locale = useUiLocale();
  const router = useRouter();
  const { invite, orgName, emailHasAccount } = preview;
  const isBuyerOrgInvite = invite.type === "buyer_org_invite";
  const [form, setForm] = useState({ name: "", password: "", orgName: "", locationName: "", locationAddress: "" });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const accept = useMutation({
    // A brand-new login starts in the language on screen; an existing person keeps theirs (01 §12).
    mutationFn: () => services.auth.acceptInvite(token, { ...form, preferredLocale: locale }),
    onSuccess: async (session) => {
      // Open the org the invite was about, and for buyers make the inviting vendor active.
      const target = isBuyerOrgInvite
        ? session.memberships.find((m) => m.orgType === "buyer")
        : session.memberships.find((m) => m.org.id === invite.targetOrgId);
      await sessionStore.signIn(session, target?.org.id);
      if (isBuyerOrgInvite && invite.vendorOrgId) await sessionStore.selectVendor(invite.vendorOrgId);
      const state = sessionStore.getState();
      router.replace(state.status === "signedIn" ? homePath(state.membership) : "/");
    },
  });

  const title = isBuyerOrgInvite ? t("buyerTitle", { org: orgName }) : t("teamTitle", { org: orgName });
  const description = isBuyerOrgInvite
    ? emailHasAccount
      ? t("buyerExisting", { org: orgName })
      : t("buyerNew", { org: orgName })
    : emailHasAccount
      ? t("teamExisting", { org: orgName })
      : t("teamNew", { org: orgName });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            accept.mutate();
          }}
        >
          <FieldGroup>
            <FormError error={accept.error} />
            <Field>
              <FieldLabel htmlFor="email">{ta("email")}</FieldLabel>
              <Input id="email" type="email" value={invite.email} readOnly disabled />
              <FieldDescription>{t("sentTo")}</FieldDescription>
            </Field>
            {!emailHasAccount && (
              <Field>
                <FieldLabel htmlFor="name">{ta("yourName")}</FieldLabel>
                <Input id="name" required autoComplete="name" value={form.name} onChange={set("name")} />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="password">{emailHasAccount ? ta("password") : t("choosePassword")}</FieldLabel>
              <Input
                id="password"
                type="password"
                required
                minLength={emailHasAccount ? undefined : 4}
                autoComplete={emailHasAccount ? "current-password" : "new-password"}
                value={form.password}
                onChange={set("password")}
              />
            </Field>
            {isBuyerOrgInvite && !emailHasAccount && (
              <>
                <FieldSeparator>{t("yourCompany")}</FieldSeparator>
                <Field>
                  <FieldLabel htmlFor="orgName">{ta("companyName")}</FieldLabel>
                  <Input id="orgName" required autoComplete="organization" value={form.orgName} onChange={set("orgName")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="locationName">{t("locationName")}</FieldLabel>
                  <Input
                    id="locationName"
                    placeholder={t("locationPlaceholder")}
                    value={form.locationName}
                    onChange={set("locationName")}
                  />
                  <FieldDescription>{t("locationHint")}</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="locationAddress">{t("address")}</FieldLabel>
                  <Input
                    id="locationAddress"
                    required
                    autoComplete="street-address"
                    value={form.locationAddress}
                    onChange={set("locationAddress")}
                  />
                </Field>
              </>
            )}
            <Button type="submit" disabled={accept.isPending}>
              {accept.isPending && <Spinner data-icon="inline-start" />}
              {emailHasAccount ? t("loginAccept") : t("accept")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
