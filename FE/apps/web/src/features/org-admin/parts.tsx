"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangleIcon } from "lucide-react";
import type { Address, ContactDraft, DraftProblem } from "@repo/core";
import { SectionHeader, SectionNav } from "@/components/section-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBusiness, useSession } from "@/lib/session";

/** Text for a client-side draft problem. */
export function useProblemText() {
  const t = useTranslations("settings");
  return useCallback((p: DraftProblem | null | undefined) => (p ? t(p) : undefined), [t]);
}

/** Settings area frame (route layout): title, organization name and section links. */
export function SettingsFrame({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const { organization } = useBusiness();
  const vendor = organization.type === "VENDOR";
  const base = vendor ? "/vendor/settings" : "/buyer/settings";
  const sections = vendor
    ? [
        { href: base, label: t("settings.nav.company") },
        { href: `${base}/contacts`, label: t("settings.nav.contacts") },
        { href: `${base}/plan`, label: t("settings.nav.plan") },
        { href: `${base}/stages`, label: t("settings.nav.stages") },
        { href: `${base}/audit`, label: t("settings.nav.audit") },
        { href: `${base}/privacy`, label: t("settings.nav.privacy") },
      ]
    : [
        { href: base, label: t("settings.nav.company") },
        { href: `${base}/team`, label: t("settings.nav.team") },
        { href: `${base}/locations`, label: t("settings.nav.locations") },
        { href: `${base}/contacts`, label: t("settings.nav.contacts") },
        { href: `${base}/audit`, label: t("settings.nav.audit") },
        { href: `${base}/privacy`, label: t("settings.nav.privacy") },
      ];
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={t("nav.settings")} subtitle={organization.displayName} nav={<SectionNav label={t("settings.nav.label")} sections={sections} />} />
      {children}
    </div>
  );
}

/** Account area frame (route layout) for vendor, buyer and admin shells. */
export function AccountFrame({ base, children }: { base: string; children: React.ReactNode }) {
  const t = useTranslations();
  const state = useSession();
  if (state.status !== "business" && state.status !== "admin") return null;
  const sections = [
    { href: base, label: t("account.nav.profile") },
    { href: `${base}/security`, label: t("account.nav.security") },
    ...(state.status === "business" ? [{ href: `${base}/notifications`, label: t("account.nav.notifications") }] : []),
  ];
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={t("nav.account")} subtitle={state.account.email} nav={<SectionNav label={t("account.nav.label")} sections={sections} />} />
      {children}
    </div>
  );
}

/** Single-section page frame (Team, Locations, Inbox in the vendor nav). */
export function PageFrame({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={title} subtitle={subtitle} action={action} />
      {children}
    </div>
  );
}

/** 409 REVISION_CONFLICT: the draft stays; the person reloads the latest revision and re-applies, or discards. */
export function ConflictAlert({ onLoadLatest, onDiscard }: { onLoadLatest: () => void; onDiscard?: () => void }) {
  const t = useTranslations("settings");
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertDescription className="flex flex-col items-start gap-2">
        <p>{t("revisionConflict")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onLoadLatest}>
            {t("loadLatest")}
          </Button>
          {onDiscard && (
            <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
              {t("discardEdits")}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function StateFilter<V extends string>({ value, onChange, options }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[] }) {
  const t = useTranslations("settings.stateFilter");
  return (
    <Select value={value} onValueChange={(v) => onChange(v as V)}>
      <SelectTrigger className="w-40" aria-label={t("label")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

type AddressKey = "line1" | "line2" | "city" | "postalCode";

/** Address members; the country is fixed by the organization except during setup. */
export function AddressFields({
  idPrefix,
  value,
  onChange,
  problems,
  serverError,
  countryEditable = false,
  disabled,
}: {
  idPrefix: string;
  value: Address;
  onChange: (next: Address) => void;
  problems: Partial<Record<"line1" | "city" | "postalCode", DraftProblem>>;
  serverError?: (key: string) => string | undefined;
  countryEditable?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("settings");
  const problemText = useProblemText();
  const field = (key: AddressKey, autoComplete: string, className?: string) => {
    const error = problemText(key === "line2" ? null : problems[key]) ?? serverError?.(key);
    return (
      <Field data-invalid={!!error || undefined} className={className}>
        <FieldLabel htmlFor={`${idPrefix}-${key}`}>
          {t(`address.${key}`)}
          {key === "line2" && <span className="font-normal text-muted-foreground">({t("optional")})</span>}
        </FieldLabel>
        <Input
          id={`${idPrefix}-${key}`}
          autoComplete={autoComplete}
          disabled={disabled}
          value={(key === "line2" ? value.line2 : value[key]) ?? ""}
          aria-invalid={!!error || undefined}
          onChange={(e) => onChange({ ...value, [key]: key === "line2" ? e.target.value || null : e.target.value })}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>
    );
  };
  return (
    <FieldGroup className="gap-4">
      {field("line1", "address-line1")}
      {field("line2", "address-line2")}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
        {field("postalCode", "postal-code")}
        {field("city", "address-level2")}
      </div>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-country`}>{t("address.country")}</FieldLabel>
        {countryEditable ? (
          <Select value={value.country} disabled={disabled} onValueChange={(v) => onChange({ ...value, country: v as Address["country"] })}>
            <SelectTrigger id={`${idPrefix}-country`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="RS">{t("countries.RS")}</SelectItem>
                <SelectItem value="BA">{t("countries.BA")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <Input id={`${idPrefix}-country`} value={t(`countries.${value.country}`)} disabled readOnly />
        )}
      </Field>
    </FieldGroup>
  );
}

/** Name / phone / optional email of a contact. */
export function ContactFields({
  idPrefix,
  value,
  onChange,
  problems,
  disabled,
}: {
  idPrefix: string;
  value: ContactDraft;
  onChange: (next: ContactDraft) => void;
  problems: Partial<Record<keyof ContactDraft, DraftProblem>>;
  disabled?: boolean;
}) {
  const t = useTranslations("settings");
  const problemText = useProblemText();
  const row = (key: keyof ContactDraft, type: string, autoComplete: string, hint?: string) => {
    const error = problemText(problems[key]);
    return (
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-${key}`}>
          {t(`contactFields.${key}`)}
          {key === "email" && <span className="font-normal text-muted-foreground">({t("optional")})</span>}
        </FieldLabel>
        <Input
          id={`${idPrefix}-${key}`}
          type={type}
          autoComplete={autoComplete}
          disabled={disabled}
          value={value[key]}
          aria-invalid={!!error || undefined}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
        {error ? <FieldError>{error}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
      </Field>
    );
  };
  return (
    <FieldGroup className="gap-4">
      {row("name", "text", "name")}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {row("phone", "tel", "tel", t("contactFields.phoneHint"))}
        {row("email", "email", "email")}
      </div>
    </FieldGroup>
  );
}
