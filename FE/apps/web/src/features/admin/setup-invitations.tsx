"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheckIcon, MailPlusIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  formatDateTime,
  isFilledWithin,
  normalizeResourceId,
  sortPlans,
  type Country,
  type Invitation,
  type Organization,
} from "@repo/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGuarded } from "@/features/auth/reauth";
import { MutationError, REASON_MAX, ReasonField } from "./parts";
import { usePlanText } from "./plan-label";
import { useAdminPlans, useInviteOrganization } from "./queries";

/*
 * Setup invitations are the only onboarding path (no self-serve signup). The backend has no
 * administrative list of sent setup invitations, so this tab remembers the ones it created
 * (in memory only) and any invitation can be opened by id (e.g. a SETUP_INVITED audit row).
 */

interface SentInvitation {
  invitation: Invitation;
  country: Country;
  type: Organization["type"];
}

let sent: SentInvitation[] = [];
const listeners = new Set<() => void>();
function remember(entry: SentInvitation) {
  sent = [entry, ...sent.filter((s) => s.invitation.id !== entry.invitation.id)].slice(0, 50);
  listeners.forEach((l) => l());
}
function useSentInvitations(): SentInvitation[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sent,
    () => sent,
  );
}

export const INVITATION_STATE_BADGE: Record<Invitation["state"], "info" | "success" | "secondary" | "warning"> = {
  PENDING: "info",
  ACCEPTED: "success",
  REVOKED: "secondary",
  EXPIRED: "warning",
  SUPERSEDED: "secondary",
};

export function InviteOrganizationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">{open && <InviteForm onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("admin.invite");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const plans = useAdminPlans();
  const planText = usePlanText();
  const invite = useInviteOrganization();
  const guarded = useGuarded();
  const [type, setType] = useState<Organization["type"]>("VENDOR");
  const [country, setCountry] = useState<Country>("RS");
  const [email, setEmail] = useState("");
  const [planId, setPlanId] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ invitation: Invitation; duplicate: boolean } | null>(null);

  const available = sortPlans(plans.data ?? []).filter((p) => !p.retired);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 254;
  const valid = emailValid && isFilledWithin(reason, REASON_MAX) && (type === "BUYER" || planId !== "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || invite.isPending) return;
    try {
      const outcome = await guarded(() =>
        invite.mutateAsync({
          recipientEmail: email.trim(),
          country,
          type,
          planRevisionId: type === "VENDOR" ? planId : null,
          reason: reason.trim(),
        }),
      );
      remember({ invitation: outcome.invitation, country, type });
      setResult(outcome);
    } catch {
      // Shown inline by MutationError; the input stays for a corrected retry.
    }
  }

  if (result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{result.duplicate ? t("duplicateTitle") : t("sentTitle")}</DialogTitle>
          <DialogDescription>{result.duplicate ? t("duplicateDescription") : t("sentDescription", { email: result.invitation.recipientEmail })}</DialogDescription>
        </DialogHeader>
        <Alert>
          <MailCheckIcon />
          <AlertTitle>{t("deliveryTitle")}</AlertTitle>
          <AlertDescription>
            {t("deliveryState", { state: ta(`invitation.delivery.${result.invitation.deliveryState}`), date: formatDateTime(result.invitation.expiresAt) })}
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button variant="outline" asChild>
            <Link href={`/admin/invitations/${result.invitation.id}`}>{t("openInvitation")}</Link>
          </Button>
          <Button onClick={onClose}>{tc("done")}</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="invite-type">{t("type")}</FieldLabel>
            <Select value={type} onValueChange={(v) => setType(v as Organization["type"])}>
              <SelectTrigger id="invite-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="VENDOR">{ta("orgType.VENDOR")}</SelectItem>
                  <SelectItem value="BUYER">{ta("orgType.BUYER")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-country">{t("country")}</FieldLabel>
            <Select value={country} onValueChange={(v) => setCountry(v as Country)}>
              <SelectTrigger id="invite-country" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="RS">{ta("country.RS")}</SelectItem>
                  <SelectItem value="BA">{ta("country.BA")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <FieldDescription>{t("immutable")}</FieldDescription>
        <Field>
          <FieldLabel htmlFor="invite-email">{t("email")}</FieldLabel>
          <Input id="invite-email" type="email" autoComplete="off" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} required />
          <FieldDescription>{t("emailHint")}</FieldDescription>
        </Field>
        {type === "VENDOR" && (
          <Field>
            <FieldLabel htmlFor="invite-plan">{t("plan")}</FieldLabel>
            <Select value={planId} onValueChange={setPlanId} disabled={plans.isPending}>
              <SelectTrigger id="invite-plan" className="w-full">
                <SelectValue placeholder={t("choosePlan")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {available.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {planText.name(p)} — {planText.limits(p)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t("planHint")}</FieldDescription>
          </Field>
        )}
        <ReasonField id="invite-reason" label={ta("reason")} hint={ta("reasonPrivateHint")} value={reason} onChange={setReason} />
      </FieldGroup>
      {plans.isError && <MutationError error={plans.error} />}
      <MutationError error={invite.error} messages={{ IDEMPOTENCY_MISMATCH: t("planMismatch") }} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={!valid || invite.isPending}>
          {invite.isPending ? <Spinner data-icon="inline-start" /> : <MailPlusIcon data-icon="inline-start" />}
          {t("send")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Invitations sent from this tab plus open-by-id (there is no admin list endpoint). */
export function SetupInvitationsCard() {
  const t = useTranslations("admin.invite");
  const ta = useTranslations("admin");
  const router = useRouter();
  const entries = useSentInvitations();
  const [lookup, setLookup] = useState("");
  const [invalid, setInvalid] = useState(false);

  function open(e: React.FormEvent) {
    e.preventDefault();
    const id = normalizeResourceId(lookup);
    setInvalid(!id);
    if (id) router.push(`/admin/invitations/${id}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <CardDescription>{t("cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noneThisSession")}</p>
        ) : (
          <Table className="text-sm" aria-label={t("cardTitle")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("type")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("country")}</TableHead>
                <TableHead className="text-right">{ta("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(({ invitation, country, type }) => (
                <TableRow key={invitation.id}>
                  <TableCell>
                    <Link href={`/admin/invitations/${invitation.id}`} className="font-medium hover:underline">
                      {invitation.recipientEmail}
                    </Link>
                  </TableCell>
                  <TableCell>{ta(`orgType.${type}`)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{ta(`country.${country}`)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={INVITATION_STATE_BADGE[invitation.state]}>{ta(`invitation.state.${invitation.state}`)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <form onSubmit={open} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field className="flex-1">
            <FieldLabel htmlFor="invitation-lookup">{t("lookup")}</FieldLabel>
            <Input id="invitation-lookup" value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder={ta("idPlaceholder")} aria-invalid={invalid} />
            {invalid && <FieldDescription className="text-destructive">{ta("invalidId")}</FieldDescription>}
          </Field>
          <Button type="submit" variant="outline">
            <SearchIcon data-icon="inline-start" />
            {ta("open")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
