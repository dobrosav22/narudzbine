"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2Icon, MailCheckIcon } from "lucide-react";
import {
  acceptTradingInvitation,
  pendingInvitationStore,
  requestInvitationProof,
  type InvitationPurpose,
  type PendingInvitation,
} from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet, FieldLegend, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { FullPageSpinner } from "@/features/shell/guards";
import { useGuarded } from "@/features/auth/reauth";
import { useSession, webStorage } from "@/lib/session";
import { FormError } from "./form-error";
import { useFragmentParams } from "./fragment";

export const pendingInvitation = pendingInvitationStore(webStorage);

const PURPOSES: InvitationPurpose[] = ["ORGANIZATION", "MEMBER", "TRADING"];

/** Loads the remembered invitation after merging what this link carried. */
export function usePendingInvitation(patch: Partial<Omit<PendingInvitation, "savedAt">> | null) {
  const [pending, setPending] = useState<PendingInvitation | null | undefined>(undefined);
  useEffect(() => {
    if (patch === null) return;
    let cancelled = false;
    const load = Object.keys(patch).length ? pendingInvitation.merge(patch) : pendingInvitation.read();
    void load.then((value) => !cancelled && setPending(value));
    return () => {
      cancelled = true;
    };
    // The patch comes from the fragment, read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch === null]);
  const update = async (next: Partial<Omit<PendingInvitation, "savedAt">>) => setPending(await pendingInvitation.merge(next));
  return { pending, update };
}

export function PurposeChoice({
  value,
  onChange,
  options = PURPOSES,
}: {
  value: InvitationPurpose | undefined;
  onChange: (purpose: InvitationPurpose) => void;
  options?: InvitationPurpose[];
}) {
  const t = useTranslations("auth.invitation");
  return (
    <FieldSet>
      <FieldLegend variant="label">{t("purposeLabel")}</FieldLegend>
      <RadioGroup value={value ?? ""} onValueChange={(v) => onChange(v as InvitationPurpose)}>
        {options.map((p) => (
          <FieldLabel key={p} htmlFor={`purpose-${p}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{t(p)}</FieldTitle>
                <FieldDescription>{t(`${p}Hint`)}</FieldDescription>
              </FieldContent>
              <RadioGroupItem value={p} id={`purpose-${p}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}

/**
 * `/accept-invitation#token=…` (from the emailed `/#/invitation?token=…`). The token alone never
 * sets anything up: setup and member invitations first prove the invited mailbox (a second,
 * 30-minute link that opens /setup), trading invitations need the invited buyer owner/admin to be
 * signed in. Which kind it is isn't readable from the token, so the person chooses.
 */
export function AcceptInvitation() {
  const t = useTranslations("auth");
  const params = useFragmentParams(["token"] as const);
  const { pending, update } = usePendingInvitation(params === null ? null : params.token ? { token: params.token } : {});
  const state = useSession();
  const guarded = useGuarded();
  const proof = useMutation({ mutationFn: (token: string) => requestInvitationProof(token) });
  const accept = useMutation({
    mutationFn: (token: string) => guarded(() => acceptTradingInvitation(token)),
    onSuccess: () => pendingInvitation.clear(),
  });

  if (params === null || pending === undefined) return <FullPageSpinner />;
  if (accept.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <CheckCircle2Icon className="size-6 text-primary" aria-hidden />
          <CardTitle className="text-xl">{t("invitation.acceptedTitle")}</CardTitle>
          <CardDescription>{t("invitation.acceptedDescription")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href={`/buyer/vendors/${accept.data.id}`}>{t("invitation.openVendor")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }
  if (!pending?.token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("invitation.missingTitle")}</CardTitle>
          <CardDescription>{t("invitation.missingDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const token = pending.token;
  const purpose = pending.purpose;
  const canAcceptTrading =
    state.status === "business" && state.organization.type === "BUYER" && (state.account.role === "OWNER" || state.account.role === "ADMIN");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("invitation.title")}</CardTitle>
        <CardDescription>{t("invitation.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PurposeChoice
          value={purpose}
          onChange={(p) => {
            proof.reset();
            accept.reset();
            void update({ purpose: p });
          }}
        />
        {(purpose === "ORGANIZATION" || purpose === "MEMBER") &&
          (pending.proof ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t("invitation.haveProof")}</p>
              <Button asChild>
                <Link href="/setup">{t("invitation.continueSetup")}</Link>
              </Button>
            </div>
          ) : proof.isSuccess ? (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <MailCheckIcon className="size-5 text-primary" aria-hidden />
              <p className="font-medium">{t("invitation.proofSentTitle")}</p>
              <p className="text-sm text-muted-foreground">{t("invitation.proofSentDescription")}</p>
              <Button variant="outline" onClick={() => proof.mutate(token)} disabled={proof.isPending}>
                {t("invitation.sendAgain")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t("invitation.proofExplain")}</p>
              <FormError error={proof.error} />
              <Button onClick={() => proof.mutate(token)} disabled={proof.isPending}>
                {proof.isPending && <Spinner data-icon="inline-start" />}
                {t("invitation.sendProof")}
              </Button>
            </div>
          ))}
        {purpose === "TRADING" &&
          (state.status === "signedOut" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t("invitation.tradingSignedOut")}</p>
              <Button asChild>
                <Link href="/login?next=%2Faccept-invitation">{t("invitation.logInToAccept")}</Link>
              </Button>
            </div>
          ) : canAcceptTrading ? (
            <div className="flex flex-col gap-3">
              <FormError error={accept.error} />
              <Button onClick={() => accept.mutate(token)} disabled={accept.isPending}>
                {accept.isPending && <Spinner data-icon="inline-start" />}
                {t("invitation.accept")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("invitation.tradingWrongAccount")}</p>
          ))}
      </CardContent>
    </Card>
  );
}
