"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon } from "lucide-react";
import {
  addressProblems,
  BACKEND_LOCALES,
  cleanAddress,
  completeMemberSetup,
  completeOrganizationSetup,
  emptyAddress,
  isApiError,
  isBackendLocale,
  requestInvitationProof,
  textOrNull,
  textProblem,
  type Locale,
} from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { AddressFields, useProblemText } from "@/features/org-admin/parts";
import { FullPageSpinner } from "@/features/shell/guards";
import { useUiLocale } from "@/lib/i18n";
import { useFieldErrorText } from "./error-text";
import { PasswordPairFields, usePasswordPair } from "./fields";
import { FormError } from "./form-error";
import { useFragmentParams } from "./fragment";
import { pendingInvitation, PurposeChoice, usePendingInvitation } from "./invitation";

/**
 * `/setup#proof=…` (from the emailed `/#/invitation-proof?token=…`). Needs the invitation token
 * remembered from the first link in this browser plus this mailbox proof. No session is issued:
 * the person logs in explicitly afterwards.
 */
export function SetupFlow() {
  const t = useTranslations("auth");
  const params = useFragmentParams(["proof"] as const);
  const { pending, update } = usePendingInvitation(params === null ? null : params.proof ? { proof: params.proof } : {});
  const [done, setDone] = useState<{ kind: "organization"; name: string } | { kind: "member"; email: string } | null>(null);

  if (params === null || pending === undefined) return <FullPageSpinner />;
  if (done) {
    return (
      <Card>
        <CardHeader>
          <CheckCircle2Icon className="size-6 text-primary" aria-hidden />
          <CardTitle className="text-xl">{t("setup.doneTitle")}</CardTitle>
          <CardDescription>{done.kind === "organization" ? t("setup.doneOrganization", { name: done.name }) : t("setup.doneMember", { email: done.email })}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/login">{t("goToLogin")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
  if (!pending?.token || !pending.proof) {
    const noToken = !pending?.token;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{noToken ? t("setup.missingInvitationTitle") : t("setup.missingProofTitle")}</CardTitle>
          <CardDescription>{noToken ? t("setup.missingInvitationDescription") : t("setup.missingProofDescription")}</CardDescription>
        </CardHeader>
        {!noToken && (
          <CardFooter>
            <Button asChild variant="outline">
              <Link href="/accept-invitation">{t("setup.backToInvitation")}</Link>
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  }

  const purpose = pending.purpose === "MEMBER" || pending.purpose === "ORGANIZATION" ? pending.purpose : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("setup.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <PurposeChoice value={purpose} onChange={(p) => void update({ purpose: p })} options={["ORGANIZATION", "MEMBER"]} />
        {purpose === "MEMBER" && (
          <MemberForm
            token={pending.token}
            proof={pending.proof}
            onDone={(email) => {
              void pendingInvitation.clear();
              setDone({ kind: "member", email });
            }}
          />
        )}
        {purpose === "ORGANIZATION" && (
          <OrganizationForm
            token={pending.token}
            proof={pending.proof}
            onDone={(name) => {
              void pendingInvitation.clear();
              setDone({ kind: "organization", name });
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** TOKEN_INVALID on setup usually means the 30-minute proof expired: offer a new one. */
function ProofExpired({ token }: { token: string }) {
  const t = useTranslations("auth.setup");
  // The current proof stays stored until the new link is opened (which replaces it).
  const resend = useMutation({ mutationFn: () => requestInvitationProof(token) });
  return resend.isSuccess ? (
    <p className="text-sm text-muted-foreground">{t("proofResent")}</p>
  ) : (
    <Button type="button" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate()}>
      {resend.isPending && <Spinner data-icon="inline-start" />}
      {t("requestNewProof")}
    </Button>
  );
}

function SetupError({ error, token }: { error: unknown; token: string }) {
  const t = useTranslations("auth.setup");
  if (!error || isApiError(error, "PASSWORD_REJECTED") || isApiError(error, "VALIDATION_FAILED")) return null;
  return (
    <div className="flex flex-col gap-2">
      {isApiError(error, "REQUEST_IN_PROGRESS") ? <p className="text-sm text-destructive">{t("inProgress")}</p> : <FormError error={error} />}
      {isApiError(error, "TOKEN_INVALID") && <ProofExpired token={token} />}
    </div>
  );
}

function MemberForm({ token, proof, onDone }: { token: string; proof: string; onDone: (email: string) => void }) {
  const t = useTranslations("auth");
  const problemText = useProblemText();
  const fieldError = useFieldErrorText();
  const pair = usePasswordPair();
  const [name, setName] = useState("");
  const [attempted, setAttempted] = useState(false);
  const setup = useMutation({
    mutationFn: () => completeMemberSetup({ token, emailProof: proof, password: pair.password, displayName: name.trim() }),
    onSuccess: (account) => onDone(account.email),
  });
  const nameProblem = textProblem(name);
  const nameError = (attempted ? problemText(nameProblem) : undefined) ?? fieldError(setup.error, "displayName");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!nameProblem && pair.valid) setup.mutate();
      }}
    >
      <FieldGroup>
        <SetupError error={setup.error} token={token} />
        <Field data-invalid={!!nameError || undefined}>
          <FieldLabel htmlFor="member-name">{t("setup.yourName")}</FieldLabel>
          <Input id="member-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          {nameError ? <FieldError>{nameError}</FieldError> : <FieldDescription>{t("setup.yourNameHint")}</FieldDescription>}
        </Field>
        <PasswordPairFields pair={pair} attempted={attempted} idPrefix="member" serverError={fieldError(setup.error, "password")} />
        <Button type="submit" disabled={setup.isPending}>
          {setup.isPending && <Spinner data-icon="inline-start" />}
          {t("setup.submitMember")}
        </Button>
      </FieldGroup>
    </form>
  );
}

function OrganizationForm({ token, proof, onDone }: { token: string; proof: string; onDone: (name: string) => void }) {
  const t = useTranslations("auth");
  const problemText = useProblemText();
  const fieldError = useFieldErrorText();
  const uiLocale = useUiLocale();
  const pair = usePasswordPair();
  const [attempted, setAttempted] = useState(false);
  const [draft, setDraft] = useState({
    ownerDisplayName: "",
    displayName: "",
    legalName: "",
    registrationIdentifier: "",
    taxIdentifier: "",
    registeredAddress: emptyAddress("RS"),
    defaultLanguage: (uiLocale === "en" ? "en" : "sr-Latn-RS") as Locale,
  });
  const problems = {
    ownerDisplayName: textProblem(draft.ownerDisplayName),
    displayName: textProblem(draft.displayName, { max: 200 }),
    legalName: textProblem(draft.legalName, { max: 200 }),
    registrationIdentifier: textProblem(draft.registrationIdentifier, { max: 64 }),
    taxIdentifier: textProblem(draft.taxIdentifier, { required: false, max: 64 }),
  };
  const addr = addressProblems(draft.registeredAddress);
  const invalid = Object.values(problems).some(Boolean) || Object.keys(addr).length > 0 || !pair.valid;
  const setup = useMutation({
    mutationFn: () =>
      completeOrganizationSetup({
        token,
        emailProof: proof,
        password: pair.password,
        ownerDisplayName: draft.ownerDisplayName.trim(),
        displayName: draft.displayName.trim(),
        legalName: draft.legalName.trim(),
        registrationIdentifier: draft.registrationIdentifier.trim(),
        taxIdentifier: textOrNull(draft.taxIdentifier),
        registeredAddress: cleanAddress(draft.registeredAddress),
        defaultLanguage: draft.defaultLanguage,
      }),
    onSuccess: (org) => onDone(org.displayName),
  });
  const err = (key: keyof typeof problems) => (attempted ? problemText(problems[key]) : undefined) ?? fieldError(setup.error, key);
  const text = (key: keyof typeof problems, label: string, hint?: string, autoComplete?: string) => (
    <Field data-invalid={!!err(key) || undefined}>
      <FieldLabel htmlFor={`setup-${key}`}>{label}</FieldLabel>
      <Input id={`setup-${key}`} autoComplete={autoComplete} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
      {err(key) ? <FieldError>{err(key)}</FieldError> : hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!invalid) setup.mutate();
      }}
    >
      <FieldGroup>
        <SetupError error={setup.error} token={token} />
        <FieldSet>
          <FieldLegend>{t("setup.you")}</FieldLegend>
          <FieldGroup>
            {text("ownerDisplayName", t("setup.yourName"), t("setup.yourNameHint"), "name")}
            <PasswordPairFields pair={pair} attempted={attempted} idPrefix="setup" serverError={fieldError(setup.error, "password")} />
          </FieldGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend>{t("setup.company")}</FieldLegend>
          <FieldGroup>
            {text("displayName", t("setup.displayName"), t("setup.displayNameHint"), "organization")}
            {text("legalName", t("setup.legalName"))}
            {text("registrationIdentifier", t("setup.registrationIdentifier"), t("setup.registrationHint"))}
            {text("taxIdentifier", t("setup.taxIdentifier"), t("setup.taxHint"))}
          </FieldGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend>{t("setup.registeredAddress")}</FieldLegend>
          <FieldDescription>{t("setup.countryHint")}</FieldDescription>
          <AddressFields
            idPrefix="setup-address"
            countryEditable
            value={draft.registeredAddress}
            onChange={(registeredAddress) => setDraft({ ...draft, registeredAddress })}
            problems={attempted ? addr : {}}
            serverError={(key) => fieldError(setup.error, `registeredAddress/${key}`)}
          />
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="setup-language">{t("setup.defaultLanguage")}</FieldLabel>
          <Select value={draft.defaultLanguage} onValueChange={(v) => isBackendLocale(v) && setDraft({ ...draft, defaultLanguage: v })}>
            <SelectTrigger id="setup-language" className="w-full">
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
          <FieldDescription>{t("setup.defaultLanguageHint")}</FieldDescription>
        </Field>
        <Button type="submit" disabled={setup.isPending}>
          {setup.isPending && <Spinner data-icon="inline-start" />}
          {t("setup.submitOrganization")}
        </Button>
      </FieldGroup>
    </form>
  );
}
