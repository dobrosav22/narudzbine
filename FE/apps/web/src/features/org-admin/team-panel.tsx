"use client";

import { useState } from "react";
import { MailPlusIcon, UserMinusIcon, UsersRoundIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  formatDate,
  formatNumber,
  isServiceError,
  removeMemberBlocker,
  USE_MOCKS,
  type Invite,
  type Membership,
  type TeamMember,
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FormError } from "@/features/auth/form-error";
import { InviteLink } from "@/features/vendor-buyers/invite-dialog";
import { useInviteTeammate, useRemoveMember, useRevokeInvite, useTeam } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText, useMsg } from "@/lib/i18n";

/**
 * 03 → "Team" (both sides): the org's users and a team-member invite (01 §9). Roles are
 * flat (01 §1), so there's nothing to assign — anyone can invite or remove anyone but
 * themselves. Pending invites can be withdrawn.
 */
export function TeamPanel({ membership }: { membership: Membership }) {
  const t = useTranslations("settings.team");
  const tm = useMsg();
  const errorText = useErrorText();
  const team = useTeam(membership);
  const remove = useRemoveMember(membership);
  const revoke = useRevokeInvite(membership);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  if (team.isError) return <ErrorState error={team.error} onRetry={() => void team.refetch()} />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("members")}</CardTitle>
          <CardDescription>
            {team.data
              ? t("membersLine", { count: team.data.members.length, countText: formatNumber(team.data.members.length), org: membership.org.name })
              : " "}
          </CardDescription>
          <CardAction>
            <Button onClick={() => setInviting(true)}>
              <MailPlusIcon data-icon="inline-start" />
              {t("invite")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {team.isPending ? (
            <RowsSkeleton rows={3} />
          ) : (
            <Table className="text-sm" aria-label={t("membersAria")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("email")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("homeLocation")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("joined")}</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.data.members.map((m) => {
                  const blockerMsg = removeMemberBlocker(m, team.data.members.length);
                  const blocker = blockerMsg && tm(blockerMsg);
                  return (
                    <TableRow key={m.user.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="flex items-center gap-2 font-medium">
                            {m.user.name}
                            {m.isYou && <Badge variant="secondary">{t("you")}</Badge>}
                          </span>
                          <span className="text-xs text-muted-foreground sm:hidden">{m.user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{m.user.email}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{m.homeLocationName ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatDate(m.user.createdAt)}</TableCell>
                      <TableCell>
                        {blocker ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {/* A disabled button gets no pointer events; the span carries the tooltip. */}
                              <span tabIndex={0} aria-label={t("cantRemove", { name: m.user.name, reason: blocker })}>
                                <Button variant="ghost" size="icon-sm" disabled aria-hidden>
                                  <UserMinusIcon />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{blocker}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button variant="ghost" size="icon-sm" aria-label={t("removeAria", { name: m.user.name })} onClick={() => setRemoving(m)}>
                            <UserMinusIcon />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pending")}</CardTitle>
          <CardDescription>{t("pendingDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {team.isPending ? (
            <RowsSkeleton rows={1} />
          ) : team.data.pending.length === 0 ? (
            <EmptyState icon={UsersRoundIcon} title={t("noPending")} />
          ) : (
            <ul aria-label={t("pending")} className="flex flex-col divide-y rounded-lg border">
              {team.data.pending.map((i) => (
                <PendingInviteRow
                  key={i.id}
                  invite={i}
                  busy={revoke.isPending && revoke.variables === i.id}
                  onRevoke={() =>
                    revoke.mutate(i.id, {
                      onSuccess: () => toast.success(t("withdrawn", { email: i.email })),
                      onError: (e) => toast.error(errorText(e)),
                    })
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <InviteTeammateDialog membership={membership} open={inviting} onOpenChange={setInviting} />

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeTitle", { name: removing?.user.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("removeDescription", { org: membership.org.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                removing &&
                remove.mutate(removing.user.id, {
                  onSuccess: () => toast.success(t("removed", { name: removing.user.name })),
                  onError: (e) => toast.error(errorText(e)),
                })
              }
            >
              {t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PendingInviteRow({ invite, busy, onRevoke }: { invite: Invite; busy: boolean; onRevoke: () => void }) {
  const t = useTranslations("settings.team");
  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-sm">{invite.email}</span>
          <span className="text-xs text-muted-foreground">{t("sent", { date: formatDate(invite.sentAt) })}</span>
        </div>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onRevoke} aria-label={t("withdrawAria", { email: invite.email })}>
          {busy ? <Spinner data-icon="inline-start" /> : <XIcon data-icon="inline-start" />}
          {t("withdraw")}
        </Button>
      </div>
      {USE_MOCKS && <InviteLink invite={invite} />}
    </li>
  );
}

function InviteTeammateDialog({
  membership,
  open,
  onOpenChange,
}: {
  membership: Membership;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.team");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<Invite>();
  const invite = useInviteTeammate(membership);
  const fieldError = isServiceError(invite.error, "VALIDATION") || isServiceError(invite.error, "CONFLICT") ? errorText(invite.error) : undefined;
  // Every way of closing resets, so reopening starts fresh (the Phase 5 invite-dialog lesson).
  const close = () => {
    onOpenChange(false);
    setEmail("");
    setSent(undefined);
    invite.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sent ? t("sentTitle") : t("inviteTitle")}</DialogTitle>
          <DialogDescription>
            {sent ? t("sentDescription", { email: sent.email, org: membership.org.name }) : t("inviteDescription", { org: membership.org.name })}
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          USE_MOCKS && <InviteLink invite={sent} />
        ) : (
          <form
            id="team-invite-form"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate(email, { onSuccess: (i) => setSent(i) });
            }}
          >
            <FieldGroup>
              {invite.error && !fieldError && <FormError error={invite.error} />}
              <Field data-invalid={!!fieldError || undefined}>
                <FieldLabel htmlFor="team-invite-email">{t("email")}</FieldLabel>
                <Input
                  id="team-invite-email"
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  aria-invalid={!!fieldError || undefined}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (invite.error) invite.reset();
                  }}
                />
                {fieldError ? <FieldError>{fieldError}</FieldError> : <FieldDescription>{t("emailHint")}</FieldDescription>}
              </Field>
            </FieldGroup>
          </form>
        )}
        <DialogFooter>
          {sent ? (
            <Button onClick={close}>{tc("done")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                {tc("cancel")}
              </Button>
              <Button type="submit" form="team-invite-form" disabled={!email || invite.isPending}>
                {invite.isPending && <Spinner data-icon="inline-start" />}
                {t("send")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
