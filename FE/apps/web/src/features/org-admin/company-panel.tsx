"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  addressProblems,
  BACKEND_LOCALES,
  canManageOrganization,
  cleanAddress,
  isApiError,
  isBackendLocale,
  organizationUpdate,
  textProblem,
  type Organization,
} from "@repo/core";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { useFieldErrorText } from "@/features/auth/error-text";
import { FormError } from "@/features/auth/form-error";
import { useGuarded } from "@/features/auth/reauth";
import { useBusiness } from "@/lib/session";
import { AddressFields, ConflictAlert, useProblemText } from "./parts";
import { useCloseOrganization, useContacts, useOrganization, useUpdateOrganization } from "./queries";

const NO_CONTACT = "none";

/** Company details (owner/admin edit, everyone reads) and, for the owner, closing the organization. */
export function CompanyPanel() {
  const { account } = useBusiness();
  const org = useOrganization();
  if (org.isError) return <ErrorState error={org.error} onRetry={() => void org.refetch()} />;
  if (org.isPending) return <RowsSkeleton rows={8} />;
  return (
    <div className="flex flex-col gap-4">
      <CompanyForm key={org.data.id} org={org.data} canEdit={canManageOrganization(account.role)} onReload={() => void org.refetch()} />
      <IdentityCard org={org.data} />
      {account.role === "OWNER" && <ClosureCard org={org.data} />}
    </div>
  );
}

function CompanyForm({ org, canEdit, onReload }: { org: Organization; canEdit: boolean; onReload: () => void }) {
  const t = useTranslations("settings");
  const problemText = useProblemText();
  const fieldError = useFieldErrorText();
  const save = useUpdateOrganization();
  const contacts = useContacts({ state: "ACTIVE", size: 100 });
  const [draft, setDraft] = useState(() => ({
    displayName: org.displayName,
    legalName: org.legalName,
    registeredAddress: org.registeredAddress,
    defaultLanguage: org.defaultLanguage as string,
    staffSubmissionRestricted: org.staffSubmissionRestricted,
    partnerContactId: org.partnerContactId,
  }));
  const [attempted, setAttempted] = useState(false);
  const problems = {
    displayName: textProblem(draft.displayName, { max: 200 }),
    legalName: textProblem(draft.legalName, { max: 200 }),
  };
  const addrProblems = attempted ? addressProblems(draft.registeredAddress) : {};
  const invalid = !!problems.displayName || !!problems.legalName || Object.keys(addressProblems(draft.registeredAddress)).length > 0;
  const conflict = isApiError(save.error, "REVISION_CONFLICT");
  const shown = (key: "displayName" | "legalName") => (attempted ? problemText(problems[key]) : undefined) ?? fieldError(save.error, key);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("company.title")}</CardTitle>
        <CardDescription>{canEdit ? t("company.description") : t("readOnly")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="company-form"
          onSubmit={(e) => {
            e.preventDefault();
            setAttempted(true);
            if (invalid) return;
            save.mutate(
              organizationUpdate(org, {
                displayName: draft.displayName.trim(),
                legalName: draft.legalName.trim(),
                registeredAddress: cleanAddress(draft.registeredAddress),
                defaultLanguage: draft.defaultLanguage,
                staffSubmissionRestricted: draft.staffSubmissionRestricted,
                partnerContactId: draft.partnerContactId,
              }),
              { onSuccess: () => toast.success(t("company.saved")) },
            );
          }}
        >
          <FieldGroup>
            {conflict ? (
              <ConflictAlert
                onLoadLatest={() => {
                  save.reset();
                  onReload();
                }}
              />
            ) : (
              save.error && <FormError error={save.error} />
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!shown("displayName") || undefined}>
                <FieldLabel htmlFor="org-display">{t("company.displayName")}</FieldLabel>
                <Input id="org-display" disabled={!canEdit} value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
                {shown("displayName") && <FieldError>{shown("displayName")}</FieldError>}
              </Field>
              <Field data-invalid={!!shown("legalName") || undefined}>
                <FieldLabel htmlFor="org-legal">{t("company.legalName")}</FieldLabel>
                <Input id="org-legal" disabled={!canEdit} value={draft.legalName} onChange={(e) => setDraft({ ...draft, legalName: e.target.value })} />
                {shown("legalName") && <FieldError>{shown("legalName")}</FieldError>}
              </Field>
            </div>
            <FieldSet>
              <FieldLegend variant="label">{t("company.registeredAddress")}</FieldLegend>
              <AddressFields
                idPrefix="org-address"
                value={draft.registeredAddress}
                disabled={!canEdit}
                problems={addrProblems}
                serverError={(key) => fieldError(save.error, `registeredAddress/${key}`)}
                onChange={(registeredAddress) => setDraft({ ...draft, registeredAddress })}
              />
            </FieldSet>
            <Field>
              <FieldLabel htmlFor="org-language">{t("company.defaultLanguage")}</FieldLabel>
              <Select value={draft.defaultLanguage} disabled={!canEdit} onValueChange={(v) => isBackendLocale(v) && setDraft({ ...draft, defaultLanguage: v })}>
                <SelectTrigger id="org-language" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {BACKEND_LOCALES.map((l) => (
                      <SelectItem key={l.value} value={l.value} lang={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{t("company.defaultLanguageHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="org-contact">{t("company.partnerContact")}</FieldLabel>
              <Select
                value={draft.partnerContactId ?? NO_CONTACT}
                disabled={!canEdit}
                onValueChange={(v) => setDraft({ ...draft, partnerContactId: v === NO_CONTACT ? null : v })}
              >
                <SelectTrigger id="org-contact" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_CONTACT}>{t("company.noPartnerContact")}</SelectItem>
                    {contacts.data?.items.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label} · {c.contact.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{t("company.partnerContactHint")}</FieldDescription>
              {fieldError(save.error, "partnerContactId") && <FieldError>{fieldError(save.error, "partnerContactId")}</FieldError>}
            </Field>
            {org.type === "BUYER" && (
              <Field orientation="horizontal">
                <Switch
                  id="org-restricted"
                  disabled={!canEdit}
                  checked={draft.staffSubmissionRestricted}
                  onCheckedChange={(v) => setDraft({ ...draft, staffSubmissionRestricted: v })}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="org-restricted">{t("company.staffRestricted")}</FieldLabel>
                  <FieldDescription>{t("company.staffRestrictedHint")}</FieldDescription>
                </div>
              </Field>
            )}
          </FieldGroup>
        </form>
      </CardContent>
      {canEdit && (
        <CardFooter>
          <Button type="submit" form="company-form" disabled={save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" />}
            {t("company.save")}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function IdentityCard({ org }: { org: Organization }) {
  const t = useTranslations("settings");
  const rows: [string, string][] = [
    [t("company.type"), t(`company.types.${org.type}`)],
    [t("company.country"), t(`countries.${org.country}`)],
    [t("company.currency"), org.currency],
    [t("company.registrationIdentifier"), org.registrationIdentifier],
    [t("company.taxIdentifier"), org.taxIdentifier ?? "—"],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("company.identity")}</CardTitle>
        <CardDescription>{t("company.identityHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ClosureCard({ org }: { org: Organization }) {
  const t = useTranslations("settings.closure");
  const tc = useTranslations("common");
  const router = useRouter();
  const guarded = useGuarded();
  const close = useCloseOrganization();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const ready = reason.trim().length > 0 && typed.trim() === org.displayName.trim();
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          {t("button")}
        </Button>
      </CardFooter>
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) close.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle", { name: org.displayName })}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            {close.error && !isApiError(close.error, "REAUTHENTICATION_REQUIRED") && <FormError error={close.error} />}
            <Field>
              <FieldLabel htmlFor="close-reason">{t("reason")}</FieldLabel>
              <Textarea id="close-reason" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
              <FieldDescription>{t("reasonHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="close-confirm">{t("typeName", { name: org.displayName })}</FieldLabel>
              <Input id="close-confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </Field>
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!ready || close.isPending}
              onClick={() =>
                void guarded(() => close.mutateAsync({ expectedRevision: org.revision, reason: reason.trim() }))
                  .then(() => router.replace("/login"))
                  .catch(() => undefined)
              }
            >
              {close.isPending && <Spinner data-icon="inline-start" />}
              {t("confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
