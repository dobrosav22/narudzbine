"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  adminKeys,
  formatDateTime,
  isApiError,
  isEvidenceReference,
  isFilledWithin,
  uuidv7,
  type Account,
  type Organization,
  type Recovery,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useGuarded } from "@/features/auth/reauth";
import { DetailList, IdText, MutationError, PageHeader, REASON_MAX, ReasonField } from "./parts";
import { useAdminRecoveryCase, useCreateRecoveryCase, useReviewRecoveryCase } from "./queries";

/*
 * Exceptional owner/email recovery (DESIGN_SPEC §4, D-ORG-052): an evidence case created by one
 * platform administrator, reviewed by a second distinct administrator after trusted evidence
 * inspection, then accepted only by the intended account itself after the notice period.
 * Administrators never receive tokens, never reassign users and cannot accept on anyone's
 * behalf. Both create and review need a password proof from the last five minutes.
 */

const RECOVERY_BADGE: Record<Recovery["state"], "info" | "warning" | "success" | "secondary" | "destructive"> = {
  EVIDENCE_REVIEW: "info",
  NOTICE_PERIOD: "warning",
  AWAITING_ACCEPTANCE: "info",
  COMPLETED: "success",
  REJECTED: "destructive",
  EXPIRED: "secondary",
  INVALIDATED: "secondary",
  RECONCILING: "warning",
};

const RECOVERY_ERRORS = (t: ReturnType<typeof useTranslations<"admin.recovery">>) => ({
  EVIDENCE_INCOMPLETE: t("evidenceIncomplete"),
  INVALID_STATE: t("invalidState"),
  IDEMPOTENCY_MISMATCH: t("idMismatch"),
  REPLAY_EXPIRED: t("replayExpired"),
  NOT_FOUND: t("notAvailable"),
  REQUEST_IN_PROGRESS: t("credentialPending"),
});

export function CreateRecoveryCaseDialog({
  org,
  target,
  kind,
  onClose,
}: {
  org: Organization;
  target: Account | null;
  kind: "OWNER" | "EMAIL";
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">{target && <CreateForm key={`${target.id}-${kind}`} org={org} target={target} kind={kind} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function CreateForm({ org, target, kind, onClose }: { org: Organization; target: Account; kind: "OWNER" | "EMAIL"; onClose: () => void }) {
  const t = useTranslations("admin.recovery");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const guarded = useGuarded();
  const create = useCreateRecoveryCase();
  // One case id per intent: a retry after a lost response replays the original creation.
  const [caseId] = useState(() => uuidv7());
  const [newEmail, setNewEmail] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitted, setSubmitted] = useState<{ newEmail: string; reason: string; evidence: string } | null>(null);

  const emailOk = kind === "OWNER" || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()) && newEmail.trim().toLowerCase() !== target.email.toLowerCase());
  const valid = emailOk && isFilledWithin(reason, REASON_MAX) && isEvidenceReference(evidence.trim());
  // After a first submit the intent is fixed: changing it would need a new case (new id).
  const changedAfterSubmit = submitted !== null && (submitted.newEmail !== newEmail || submitted.reason !== reason || submitted.evidence !== evidence);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || create.isPending || changedAfterSubmit) return;
    setSubmitted({ newEmail, reason, evidence });
    try {
      const created = await guarded(() =>
        create.mutateAsync({
          id: caseId,
          kind,
          organizationId: org.id,
          targetAccountId: target.id,
          newEmail: kind === "EMAIL" ? newEmail.trim() : null,
          reason: reason.trim(),
          evidenceReference: evidence.trim(),
        }),
      );
      toast.success(t("created"));
      onClose();
      router.push(`/admin/recovery-cases/${created.id}`);
    } catch {
      // Inline error; same id + same intent may be retried.
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{kind === "OWNER" ? t("ownerTitle", { name: target.displayName }) : t("emailTitle", { name: target.displayName })}</DialogTitle>
        <DialogDescription>{kind === "OWNER" ? t("ownerDescription", { org: org.displayName }) : t("emailDescription")}</DialogDescription>
      </DialogHeader>
      <Alert>
        <LifeBuoyIcon />
        <AlertTitle>{t("procedureTitle")}</AlertTitle>
        <AlertDescription>{t("procedure")}</AlertDescription>
      </Alert>
      <FieldGroup>
        {kind === "EMAIL" && (
          <Field>
            <FieldLabel htmlFor="recovery-email">{t("newEmail")}</FieldLabel>
            <Input id="recovery-email" type="email" autoComplete="off" maxLength={254} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <FieldDescription>{t("newEmailHint", { email: target.email })}</FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="recovery-evidence">{t("evidence")}</FieldLabel>
          <Input
            id="recovery-evidence"
            autoComplete="off"
            maxLength={200}
            className="font-mono"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            aria-invalid={evidence !== "" && !isEvidenceReference(evidence.trim())}
          />
          <FieldDescription>{t("evidenceHint")}</FieldDescription>
        </Field>
        <ReasonField id="recovery-reason" label={ta("reason")} hint={ta("reasonPrivateHint")} value={reason} onChange={setReason} />
      </FieldGroup>
      {changedAfterSubmit && <p className="text-sm text-muted-foreground">{t("changedAfterSubmit")}</p>}
      <MutationError error={create.error} messages={RECOVERY_ERRORS(t)} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" disabled={!valid || create.isPending || changedAfterSubmit}>
          {create.isPending && <Spinner data-icon="inline-start" />}
          {t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** /admin/recovery-cases/[caseId]: private case metadata (each read is audited) and the review. */
export function AdminRecoveryCaseScreen({ caseId }: { caseId: string }) {
  const t = useTranslations("admin.recovery");
  const ta = useTranslations("admin");
  const recovery = useAdminRecoveryCase(caseId);

  if (recovery.isError) {
    return isApiError(recovery.error, "NOT_FOUND") ? (
      <EmptyState icon={LifeBuoyIcon} title={t("notFound")} description={t("notFoundDescription")}>
        <Button asChild variant="outline">
          <Link href="/admin/audit">{ta("audit.title")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={recovery.error} onRetry={() => void recovery.refetch()} />
    );
  }
  if (recovery.isPending) return <RowsSkeleton rows={6} />;
  const c = recovery.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t(`kind.${c.kind}`)}
        backHref={`/admin/organizations/${c.organizationId}`}
        backLabel={t("backToOrganization")}
        badges={<Badge variant={RECOVERY_BADGE[c.state]}>{t(`state.${c.state}`)}</Badge>}
        description={t(`stateHelp.${c.state}`)}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("caseTitle")}</CardTitle>
          <CardDescription>{t("caseDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: t("caseId"), value: <IdText id={c.id} /> },
              {
                label: t("organization"),
                value: (
                  <Link href={`/admin/organizations/${c.organizationId}`} className="font-medium hover:underline">
                    {t("openOrganization")}
                  </Link>
                ),
              },
              { label: t("target"), value: <IdText id={c.targetAccountId} /> },
              { label: t("notBefore"), value: formatDateTime(c.notBefore) },
              { label: t("expiresAt"), value: formatDateTime(c.expiresAt) },
            ]}
          />
        </CardContent>
      </Card>
      {c.state === "EVIDENCE_REVIEW" && <ReviewCard recovery={c} />}
    </div>
  );
}

function ReviewCard({ recovery }: { recovery: Recovery }) {
  const t = useTranslations("admin.recovery");
  const ta = useTranslations("admin");
  const guarded = useGuarded();
  const review = useReviewRecoveryCase();
  const qc = useQueryClient();
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const valid = isFilledWithin(reason, REASON_MAX) && isEvidenceReference(evidence.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || review.isPending) return;
    try {
      await guarded(() =>
        review.mutateAsync({
          caseId: recovery.id,
          body: { expectedRevision: recovery.revision, approve: decision === "approve", reason: reason.trim(), evidenceReference: evidence.trim() },
        }),
      );
      toast.success(decision === "approve" ? t("approved") : t("rejected"));
    } catch (err) {
      // Inline error; a stale case is reloaded so the reviewer sees its current state.
      if (isApiError(err, "REVISION_CONFLICT")) void qc.invalidateQueries({ queryKey: adminKeys.recoveryCase(recovery.id) });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reviewTitle")}</CardTitle>
        <CardDescription>{t("reviewDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="review-decision">{t("decision")}</FieldLabel>
              <Select value={decision} onValueChange={(v) => setDecision(v as "approve" | "reject")}>
                <SelectTrigger id="review-decision" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="approve">{t("approve")}</SelectItem>
                    <SelectItem value="reject">{t("reject")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{decision === "approve" ? t("approveHint") : t("rejectHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="review-evidence">{t("evidence")}</FieldLabel>
              <Input id="review-evidence" className="font-mono" autoComplete="off" maxLength={200} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
              <FieldDescription>{t("evidenceHint")}</FieldDescription>
            </Field>
            <ReasonField id="review-reason" label={ta("reason")} hint={ta("reasonPrivateHint")} value={reason} onChange={setReason} />
          </FieldGroup>
          <MutationError error={review.error} messages={{ ...RECOVERY_ERRORS(t), REVISION_CONFLICT: t("stale") }} />
          <div>
            <Button type="submit" variant={decision === "reject" ? "destructive" : "default"} disabled={!valid || review.isPending}>
              {review.isPending && <Spinner data-icon="inline-start" />}
              {decision === "approve" ? t("approve") : t("reject")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
