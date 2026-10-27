"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BACKEND_LOCALES, isApiError, isBackendLocale, textProblem, type Account } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "@/features/auth/form-error";
import { ConflictAlert, useProblemText } from "@/features/org-admin/parts";
import { useActiveLocations } from "@/features/org-admin/queries";
import { changeLanguage } from "@/lib/i18n";
import { sessionStore, useSession } from "@/lib/session";
import { useIdErrorText } from "@/features/auth/error-text";
import { useUpdateProfile } from "./queries";

const NO_HOME = "none";
const INHERIT = "inherit";

/** Own name, home location (business accounts) and language. */
export function ProfilePanel() {
  const state = useSession();
  if (state.status !== "business" && state.status !== "admin") return null;
  return (
    <div className="flex flex-col gap-4">
      <ProfileCard key={state.account.id} account={state.account} business={state.status === "business"} />
      <LanguageCard account={state.account} orgDefault={state.status === "business" ? state.organization.defaultLanguage : "en"} />
    </div>
  );
}

function ProfileCard({ account, business }: { account: Account; business: boolean }) {
  const t = useTranslations("account.profile");
  const problemText = useProblemText();
  const [name, setName] = useState(account.displayName);
  const [home, setHome] = useState<string>(account.homeLocationId ?? NO_HOME);
  const [attempted, setAttempted] = useState(false);
  const save = useUpdateProfile();
  const locations = useActiveLocations(business);
  const nameProblem = problemText(textProblem(name));
  const conflict = isApiError(save.error, "REVISION_CONFLICT");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAttempted(true);
            if (nameProblem) return;
            save.mutate(
              { expectedRevision: account.revision, displayName: name.trim(), homeLocationId: home === NO_HOME ? null : home },
              { onSuccess: () => toast.success(t("saved")) },
            );
          }}
        >
          <FieldGroup>
            {conflict ? (
              <ConflictAlert
                onLoadLatest={() => void sessionStore.refresh().then(() => save.reset())}
                onDiscard={() => {
                  setName(account.displayName);
                  setHome(account.homeLocationId ?? NO_HOME);
                  save.reset();
                }}
              />
            ) : (
              <FormError error={save.error} />
            )}
            <Field data-invalid={(attempted && !!nameProblem) || undefined}>
              <FieldLabel htmlFor="profile-name">{t("name")}</FieldLabel>
              <Input id="profile-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={(attempted && !!nameProblem) || undefined} />
              {attempted && nameProblem && <FieldError>{nameProblem}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">{t("email")}</FieldLabel>
              <Input id="profile-email" value={account.email} readOnly disabled />
              <FieldDescription>{t("emailHint")}</FieldDescription>
            </Field>
            {business && (
              <Field>
                <FieldLabel htmlFor="profile-home">{t("home")}</FieldLabel>
                <Select value={home} onValueChange={setHome} disabled={locations.isPending}>
                  <SelectTrigger id="profile-home" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NO_HOME}>{t("noHome")}</SelectItem>
                      {locations.data?.items.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{t("homeHint")}</FieldDescription>
              </Field>
            )}
            <div>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Spinner data-icon="inline-start" />}
                {t("save")}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function LanguageCard({ account, orgDefault }: { account: Account; orgDefault: string }) {
  const t = useTranslations("account.language");
  const errorText = useIdErrorText();
  const [saving, setSaving] = useState(false);
  const orgLabel = BACKEND_LOCALES.find((l) => l.value === orgDefault)?.label ?? orgDefault;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Field className="max-w-sm">
          <FieldLabel htmlFor="account-language">{t("label")}</FieldLabel>
          <Select
            value={account.languageOverride ?? INHERIT}
            disabled={saving}
            onValueChange={(v) => {
              setSaving(true);
              changeLanguage(v === INHERIT ? null : isBackendLocale(v) ? v : null)
                .then(() => toast.success(t("saved")))
                .catch((e: unknown) => toast.error(errorText(e)))
                .finally(() => setSaving(false));
            }}
          >
            <SelectTrigger id="account-language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={INHERIT}>{t("inherit", { language: orgLabel })}</SelectItem>
                {BACKEND_LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value} lang={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </CardContent>
    </Card>
  );
}
