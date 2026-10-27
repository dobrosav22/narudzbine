"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailIcon, RotateCwIcon, UsersIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  buyerInviteNeedsResend,
  formatDate,
  formatDateTime,
  isOrgAdmin,
  isUncertainOutcome,
  planAtLimit,
  usageMsg,
  uuidv4,
  type Invitation,
  type RelationshipState,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanLimitNotice } from "@/features/subscription/plan-limit";
import { useVendorPlan } from "@/features/subscription/queries";
import { useErrorText, useMsg } from "@/lib/i18n";
import { useBusiness } from "@/lib/session";
import { InviteBuyerDialog } from "./invite-dialog";
import { Pager, PartnerName } from "./parts";
import { useBuyerInvitations, useRelationships, useResendInvitation, useRevokeInvitation } from "./queries";

type View = "ACTIVE" | "DISCONNECTED" | "INVITATIONS";
const PAGE_SIZE = 25;

/** Vendor → Buyers: connected and formerly connected buyers, pending buyer invitations, invite. */
export function VendorBuyersScreen() {
  const t = useTranslations("vendorBuyers");
  const tm = useMsg();
  const session = useBusiness();
  const admin = isOrgAdmin(session);
  const [view, setView] = useState<View>("ACTIVE");
  const plan = useVendorPlan();
  const atLimit = planAtLimit(plan.data, "buyers");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{plan.data ? tm(usageMsg(plan.data, "buyers")) : " "}</p>
        </div>
        {admin && <InviteBuyerDialog onSent={() => setView("INVITATIONS")} />}
      </div>

      {/* Pending invitations reserve nothing; the cap is checked when a buyer accepts. */}
      {plan.data && atLimit && <PlanLimitNotice plan={plan.data} limit="buyers" />}

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList>
          <TabsTrigger value="ACTIVE">{t("tabs.active")}</TabsTrigger>
          <TabsTrigger value="DISCONNECTED">{t("tabs.disconnected")}</TabsTrigger>
          {admin && <TabsTrigger value="INVITATIONS">{t("tabs.invitations")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="ACTIVE">
          <RelationshipTable state="ACTIVE" />
        </TabsContent>
        <TabsContent value="DISCONNECTED">
          <RelationshipTable state="DISCONNECTED" />
        </TabsContent>
        {admin && (
          <TabsContent value="INVITATIONS">
            <InvitationTable />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function RelationshipTable({ state }: { state: RelationshipState }) {
  const t = useTranslations("vendorBuyers");
  const router = useRouter();
  const [page, setPage] = useState(0);
  const list = useRelationships({ state, page, size: PAGE_SIZE, includeTotal: true });

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (list.isPending) return <RowsSkeleton />;
  if (list.data.items.length === 0) {
    return state === "ACTIVE" ? (
      <EmptyState icon={UsersIcon} title={t("emptyTitle")} description={t("emptyDescription")} />
    ) : (
      <EmptyState icon={UsersIcon} title={t("emptyDisconnectedTitle")} description={t("emptyDisconnectedDescription")} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>{t("buyer")}</TableHead>
              <TableHead>{state === "ACTIVE" ? t("connectedSince") : t("disconnectedOn")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("prices")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data.items.map((r) => {
              const href = `/vendor/buyers/${r.id}`;
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(href)}>
                  <TableCell>
                    <Link href={href} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      <PartnerName organizationId={r.buyerId} />
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(state === "ACTIVE" ? r.createdAt : r.updatedAt)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {r.agreedPriceConfirmationRequired ? <Badge variant="warning">{t("reviewNeeded")}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} size={PAGE_SIZE} total={list.data.total} itemCount={list.data.items.length} onPage={setPage} />
    </div>
  );
}

const DELIVERY_BADGE: Record<Invitation["deliveryState"], "info" | "success" | "warning" | "destructive" | "secondary"> = {
  QUEUED: "secondary",
  SENDING: "secondary",
  ACCEPTED: "info",
  DELIVERED: "success",
  FAILED: "destructive",
  UNKNOWN: "warning",
};

function InvitationTable() {
  const t = useTranslations("vendorBuyers");
  const ti = useTranslations("vendorBuyers.invitations");
  const errorText = useErrorText();
  const invitations = useBuyerInvitations("PENDING");
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  // One Idempotency-Key per resend intent, kept only while its outcome is unknown.
  const keys = useRef(new Map<string, string>());
  const [uncertain, setUncertain] = useState<Set<string>>(new Set());

  const doResend = (invitation: Invitation) => {
    const key = keys.current.get(invitation.id) ?? uuidv4();
    keys.current.set(invitation.id, key);
    // mutateAsync: each row's outcome is handled even when several resends overlap.
    resend.mutateAsync({ invitationId: invitation.id, expectedRevision: invitation.revision, idempotencyKey: key }).then(
      () => {
        keys.current.delete(invitation.id);
        setUncertain((s) => new Set([...s].filter((id) => id !== invitation.id)));
        toast.success(ti("resent", { email: invitation.recipientEmail }));
      },
      (error: unknown) => {
        if (isUncertainOutcome(error)) {
          setUncertain((s) => new Set(s).add(invitation.id));
          toast.error(ti("resendUncertain"));
        } else {
          keys.current.delete(invitation.id);
          setUncertain((s) => new Set([...s].filter((id) => id !== invitation.id)));
          toast.error(errorText(error));
        }
      },
    );
  };

  if (invitations.isError) return <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />;
  if (invitations.isPending) return <RowsSkeleton rows={4} />;
  if (invitations.data.length === 0) return <EmptyState icon={MailIcon} title={ti("emptyTitle")} description={ti("emptyDescription")} />;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{ti("note")}</p>
      <div className="rounded-lg border">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>{ti("recipient")}</TableHead>
              <TableHead className="hidden sm:table-cell">{ti("kind")}</TableHead>
              <TableHead>{ti("delivery")}</TableHead>
              <TableHead className="hidden md:table-cell">{ti("expires")}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{ti("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.data.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium break-all">{inv.recipientEmail}</span>
                    <span className="text-xs text-muted-foreground">{ti("sentOn", { date: formatDate(inv.createdAt) })}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {inv.purpose === "TRADING" && inv.targetOrganizationId ? (
                    <span className="flex flex-col">
                      {ti("kindReconnect")}
                      <PartnerName organizationId={inv.targetOrganizationId} className="text-xs text-muted-foreground" />
                    </span>
                  ) : (
                    ti("kindNew")
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant={DELIVERY_BADGE[inv.deliveryState]}>{ti(`deliveryState.${inv.deliveryState}`)}</Badge>
                    {buyerInviteNeedsResend(inv) && <span className="text-xs text-muted-foreground">{ti("needsResend")}</span>}
                    {uncertain.has(inv.id) && <span className="text-xs text-warning-foreground dark:text-warning">{ti("resendUncertain")}</span>}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{formatDateTime(inv.expiresAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => doResend(inv)}
                    >
                      <RotateCwIcon data-icon="inline-start" />
                      {uncertain.has(inv.id) ? ti("retryResend") : ti("resend")}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <XIcon data-icon="inline-start" />
                          {ti("revoke")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{ti("revokeTitle", { email: inv.recipientEmail })}</AlertDialogTitle>
                          <AlertDialogDescription>{ti("revokeDescription")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() =>
                              revoke.mutateAsync(inv.id).then(
                                () => toast.success(ti("revoked", { email: inv.recipientEmail })),
                                (e: unknown) => toast.error(errorText(e)),
                              )
                            }
                          >
                            {ti("revoke")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
