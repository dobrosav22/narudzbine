"use client";

import { useState } from "react";
import Link from "next/link";
import { MailIcon, RefreshCwIcon, SendIcon, XCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatDateTime, isApiError, isUncertainOutcome, uuidv4, type Invitation } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useGuarded } from "@/features/auth/reauth";
import { useErrorText } from "@/lib/i18n";
import { DetailList, IdText, MutationError, PageHeader } from "./parts";
import { useAdminInvitation, useResendInvitation, useRevokeInvitation } from "./queries";
import { INVITATION_STATE_BADGE } from "./setup-invitations";

/**
 * One setup invitation (getInvitation). Only the original sending administrator can read,
 * resend or revoke it. Delivery is asynchronous: QUEUED is not "delivered"; failed or unknown
 * delivery needs a manual resend.
 */
export function AdminInvitationScreen({ invitationId }: { invitationId: string }) {
  const t = useTranslations("admin.invitation");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const guarded = useGuarded();
  const invitation = useAdminInvitation(invitationId);
  const revoke = useRevokeInvitation();
  const [resending, setResending] = useState(false);
  const [revoking, setRevoking] = useState(false);

  if (invitation.isError) {
    return isApiError(invitation.error, "NOT_FOUND") ? (
      <EmptyState icon={MailIcon} title={t("notFound")} description={t("notFoundDescription")}>
        <Button asChild variant="outline">
          <Link href="/admin/organizations">{ta("organizations.title")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={invitation.error} onRetry={() => void invitation.refetch()} />
    );
  }
  if (invitation.isPending) return <RowsSkeleton rows={6} />;
  const inv = invitation.data;
  const pending = inv.state === "PENDING";
  const needsResend = pending && (inv.deliveryState === "FAILED" || inv.deliveryState === "UNKNOWN");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={inv.recipientEmail}
        backHref="/admin/organizations"
        backLabel={ta("organizations.title")}
        badges={<Badge variant={INVITATION_STATE_BADGE[inv.state]}>{ta(`invitation.state.${inv.state}`)}</Badge>}
        description={ta(`invitation.purpose.${inv.purpose}`)}
        actions={
          <>
            <Button variant="outline" onClick={() => void invitation.refetch()} disabled={invitation.isFetching}>
              {invitation.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
              {t("refresh")}
            </Button>
            {pending && (
              <>
                <Button variant="outline" onClick={() => setResending(true)}>
                  <SendIcon data-icon="inline-start" />
                  {t("resend")}
                </Button>
                <Button variant="destructive" onClick={() => setRevoking(true)}>
                  <XCircleIcon data-icon="inline-start" />
                  {t("revoke")}
                </Button>
              </>
            )}
          </>
        }
      />

      {needsResend && (
        <Alert>
          <AlertDescription>{t("deliveryProblem")}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("details")}</CardTitle>
          <CardDescription>{t("detailsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: t("id"), value: <IdText id={inv.id} /> },
              { label: t("deliveryLabel"), value: ta(`invitation.delivery.${inv.deliveryState}`) },
              { label: t("expires"), value: formatDateTime(inv.expiresAt) },
              { label: t("created"), value: formatDateTime(inv.createdAt) },
              { label: t("updated"), value: formatDateTime(inv.updatedAt) },
              {
                label: t("organization"),
                value: inv.targetOrganizationId ? (
                  <Link href={`/admin/organizations/${inv.targetOrganizationId}`} className="font-medium hover:underline">
                    {t("openOrganization")}
                  </Link>
                ) : (
                  t("noOrganizationYet")
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Dialog open={resending} onOpenChange={setResending}>
        <DialogContent>{resending && <ResendForm invitation={inv} onClose={() => setResending(false)} />}</DialogContent>
      </Dialog>

      <AlertDialog open={revoking} onOpenChange={setRevoking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeTitle", { email: inv.recipientEmail })}</AlertDialogTitle>
            <AlertDialogDescription>{t("revokeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                void guarded(() => revoke.mutateAsync(inv.id)).then(
                  () => toast.success(t("revoked")),
                  (e: unknown) => toast.error(errorText(e)),
                )
              }
            >
              {t("revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Resend rotates the link and queues one new email. The Idempotency-Key belongs to this intent:
 * it is reused only to retry the same request after an uncertain outcome, never automatically.
 */
function ResendForm({ invitation, onClose }: { invitation: Invitation; onClose: () => void }) {
  const t = useTranslations("admin.invitation");
  const tc = useTranslations("common");
  const guarded = useGuarded();
  const resend = useResendInvitation();
  const [key] = useState(() => uuidv4());
  const [revision] = useState(invitation.revision);
  const uncertain = resend.isError && isUncertainOutcome(resend.error);

  async function submit() {
    try {
      await guarded(() => resend.mutateAsync({ invitationId: invitation.id, expectedRevision: revision, idempotencyKey: key }));
      toast.success(t("resent"));
      onClose();
    } catch {
      // Inline error below.
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("resendTitle")}</DialogTitle>
        <DialogDescription>{t("resendDescription", { email: invitation.recipientEmail })}</DialogDescription>
      </DialogHeader>
      {uncertain && (
        <Alert>
          <AlertDescription>{t("resendUncertain")}</AlertDescription>
        </Alert>
      )}
      <MutationError error={resend.error} messages={{ REVISION_CONFLICT: t("resendStale") }} />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={resend.isPending || (resend.isError && !uncertain)}>
          {resend.isPending && <Spinner data-icon="inline-start" />}
          {uncertain ? t("retrySame") : t("resend")}
        </Button>
      </DialogFooter>
    </>
  );
}
