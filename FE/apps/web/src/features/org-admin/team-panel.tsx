"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CopyIcon, MailPlusIcon, MoreHorizontalIcon, UsersRoundIcon } from "lucide-react";
import {
  canManageOrganization,
  emailProblem,
  formatDate,
  formatDateTime,
  invitableRoles,
  isApiError,
  isUuid,
  isUncertainOutcome,
  memberActions,
  organizationQueries,
  uuidv4,
  type Account,
  type Invitation,
  type OwnershipTransfer,
} from "@repo/core";
import { useQueryClient } from "@tanstack/react-query";
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
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { useIdErrorText } from "@/features/auth/error-text";
import { FormError } from "@/features/auth/form-error";
import { useGuarded } from "@/features/auth/reauth";
import { sessionStore, useBusiness } from "@/lib/session";
import { StateFilter, useProblemText } from "./parts";
import {
  useAcceptTransfer,
  useChangeMemberRole,
  useDeactivateMember,
  useInvitations,
  useInviteMember,
  useLatestTransfer,
  useMembers,
  useReactivateMember,
  useRequestTransfer,
  useResendInvitation,
  useRevokeInvitation,
  useRevokeTransfer,
} from "./queries";

/** Members, member invitations and ownership transfer. Fixed roles; the backend enforces every rule. */
export function TeamPanel() {
  const { account } = useBusiness();
  const manager = canManageOrganization(account.role);
  return (
    <div className="flex flex-col gap-4">
      <MembersCard />
      {manager && <InvitationsCard />}
      <OwnershipCard />
    </div>
  );
}

function MembersCard() {
  const t = useTranslations("settings.team");
  const tc = useTranslations("common");
  const errorText = useIdErrorText();
  const guarded = useGuarded();
  const { account, organization } = useBusiness();
  const [state, setState] = useState<"ACTIVE" | "DEACTIVATED">("ACTIVE");
  const members = useMembers({ state, size: 100 });
  const changeRole = useChangeMemberRole();
  const deactivate = useDeactivateMember();
  const reactivate = useReactivateMember();
  const offer = useRequestTransfer();
  const [deactivating, setDeactivating] = useState<Account | null>(null);
  const [offering, setOffering] = useState<Account | null>(null);

  const fail = (e: unknown) => {
    if (isApiError(e, "REVISION_CONFLICT")) void members.refetch();
    if (!isApiError(e, "REAUTHENTICATION_REQUIRED")) toast.error(errorText(e));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("members")}</CardTitle>
        <CardDescription>{t("rolesNote")}</CardDescription>
        <CardAction>
          <StateFilter
            value={state}
            onChange={setState}
            options={[
              { value: "ACTIVE", label: t("stateFilter.ACTIVE") },
              { value: "DEACTIVATED", label: t("stateFilter.DEACTIVATED") },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {members.isError ? (
          <ErrorState error={members.error} onRetry={() => void members.refetch()} />
        ) : members.isPending ? (
          <RowsSkeleton rows={3} />
        ) : members.data.items.length === 0 ? (
          <EmptyState icon={UsersRoundIcon} title={t("stateFilter.DEACTIVATED")} />
        ) : (
          <Table className="text-sm" aria-label={t("membersAria")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("email")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("joined")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.items.map((m) => {
                const can = memberActions(account, m);
                const any = can.changeRole || can.deactivate || can.reactivate || can.transferOwnership;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="flex items-center gap-2 font-medium">
                          {m.displayName}
                          {m.id === account.id && <Badge variant="secondary">{t("you")}</Badge>}
                        </span>
                        <span className="text-xs text-muted-foreground sm:hidden">{m.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{m.email}</TableCell>
                    <TableCell>
                      <Badge variant={m.role === "OWNER" ? "default" : "outline"}>{m.role ? t(`roles.${m.role}`) : "—"}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{formatDate(m.createdAt)}</TableCell>
                    <TableCell>
                      {any && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={t("actionsFor", { name: m.displayName })}>
                              <MoreHorizontalIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              {can.changeRole && (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    const role = m.role === "ADMIN" ? "STAFF" : "ADMIN";
                                    void guarded(() => changeRole.mutateAsync({ id: m.id, revision: m.revision, role }))
                                      .then(() => toast.success(t("roleChanged", { name: m.displayName, role: t(`roles.${role}`) })))
                                      .catch(fail);
                                  }}
                                >
                                  {m.role === "ADMIN" ? t("makeStaff") : t("makeAdmin")}
                                </DropdownMenuItem>
                              )}
                              {can.reactivate && (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    void guarded(() => reactivate.mutateAsync({ id: m.id, revision: m.revision }))
                                      .then(() => toast.success(t("reactivated", { name: m.displayName })))
                                      .catch(fail)
                                  }
                                >
                                  {t("reactivate")}
                                </DropdownMenuItem>
                              )}
                              {can.transferOwnership && <DropdownMenuItem onSelect={() => setOffering(m)}>{t("offerOwnership")}</DropdownMenuItem>}
                              {can.deactivate && (
                                <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(m)}>
                                  {t("deactivate")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog open={deactivating !== null} onOpenChange={(o) => !o && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deactivateTitle", { name: deactivating?.displayName ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deactivateDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const m = deactivating;
                if (!m) return;
                void guarded(() => deactivate.mutateAsync({ id: m.id, revision: m.revision }))
                  .then(() => toast.success(t("deactivated", { name: m.displayName })))
                  .catch(fail);
              }}
            >
              {t("deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={offering !== null} onOpenChange={(o) => !o && setOffering(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("transfer.offerTitle", { name: offering?.displayName ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("transfer.offerDescription", { name: offering?.displayName ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const m = offering;
                if (!m) return;
                // The organization revision is the natural identity of this request.
                void guarded(() => offer.mutateAsync({ recipientId: m.id, orgRevision: organization.revision }))
                  .then(() => toast.success(t("transfer.offered", { name: m.displayName })))
                  .catch(fail);
              }}
            >
              {t("transfer.offer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function InvitationsCard() {
  const t = useTranslations("settings.team");
  const errorText = useIdErrorText();
  const { account, organization } = useBusiness();
  const [pendingOnly, setPendingOnly] = useState<"PENDING" | "all">("PENDING");
  const invitations = useInvitations({ size: 100, ...(pendingOnly === "PENDING" ? { state: "PENDING" } : {}) }, true);
  const revoke = useRevokeInvitation();
  const resend = useResendInvitation();
  // Idempotency-Key per resend intent, kept only for retrying that same resend after an uncertain outcome.
  const resendKeys = useRef(new Map<string, string>());
  const [inviting, setInviting] = useState(false);
  // Vendors also see buyer invitations here; this list is for team members only.
  const items = invitations.data?.items.filter((i) => i.purpose === "MEMBER") ?? [];

  const doResend = (i: Invitation) => {
    const key = resendKeys.current.get(i.id) ?? uuidv4();
    resendKeys.current.set(i.id, key);
    resend.mutate(
      { id: i.id, revision: i.revision, key },
      {
        onSuccess: () => {
          resendKeys.current.delete(i.id);
          toast.success(t("resent", { email: i.recipientEmail }));
        },
        onError: (e) => {
          if (!isUncertainOutcome(e)) resendKeys.current.delete(i.id);
          if (isApiError(e, "REVISION_CONFLICT")) void invitations.refetch();
          toast.error(errorText(e));
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invitations")}</CardTitle>
        <CardDescription>{t("invitationsDescription")}</CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <StateFilter
            value={pendingOnly}
            onChange={setPendingOnly}
            options={[
              { value: "PENDING", label: t("pendingOnly") },
              { value: "all", label: t("invitations") },
            ]}
          />
          <Button onClick={() => setInviting(true)}>
            <MailPlusIcon data-icon="inline-start" />
            {t("invite")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {invitations.isError ? (
          <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />
        ) : invitations.isPending ? (
          <RowsSkeleton rows={2} />
        ) : items.length === 0 ? (
          <EmptyState icon={MailPlusIcon} title={t("noInvitations")} />
        ) : (
          <ul aria-label={t("invitationsAria")} className="flex flex-col divide-y rounded-lg border">
            {items.map((i) => {
              // The invited role isn't in the invitation metadata (gap): the backend refuses what an admin may not do.
              const canAct = i.state === "PENDING";
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-sm">{i.recipientEmail}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{t(`invitationStates.${i.state}`)}</Badge>
                      {i.state === "PENDING" && <span>{t(`delivery.${i.deliveryState}`)}</span>}
                      {i.state === "PENDING" && <span>{t("expires", { date: formatDateTime(i.expiresAt) })}</span>}
                    </span>
                  </div>
                  {canAct && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" disabled={resend.isPending && resend.variables?.id === i.id} onClick={() => doResend(i)}>
                        {t("resend")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revoke.isPending && revoke.variables === i.id}
                        onClick={() =>
                          revoke.mutate(i.id, {
                            onSuccess: () => toast.success(t("revoked", { email: i.recipientEmail })),
                            onError: (e) => toast.error(errorText(e)),
                          })
                        }
                      >
                        {t("revoke")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <InviteDialog open={inviting} onOpenChange={setInviting} roles={invitableRoles(account.role)} org={organization.displayName} />
    </Card>
  );
}

function InviteDialog({ open, onOpenChange, roles, org }: { open: boolean; onOpenChange: (o: boolean) => void; roles: ("ADMIN" | "STAFF")[]; org: string }) {
  const t = useTranslations("settings.team");
  const tc = useTranslations("common");
  const problemText = useProblemText();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [attempted, setAttempted] = useState(false);
  const invite = useInviteMember();
  const problem = emailProblem(email, true);
  const close = () => {
    onOpenChange(false);
    setEmail("");
    setRole("STAFF");
    setAttempted(false);
    invite.reset();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>{t("inviteDescription", { org })}</DialogDescription>
        </DialogHeader>
        <form
          id="invite-form"
          onSubmit={(e) => {
            e.preventDefault();
            setAttempted(true);
            if (problem) return;
            invite.mutate(
              { email: email.trim(), role },
              {
                onSuccess: (i) => {
                  toast.success(t("invited", { email: i.recipientEmail }));
                  close();
                },
              },
            );
          }}
        >
          <FieldGroup>
            <FormError error={invite.error} />
            <Field data-invalid={(attempted && !!problem) || undefined}>
              <FieldLabel htmlFor="invite-email">{t("inviteEmail")}</FieldLabel>
              <Input id="invite-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
              {attempted && problem && <FieldError>{problemText(problem)}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">{t("inviteRole")}</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as "ADMIN" | "STAFF")}>
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="invite-form" disabled={invite.isPending}>
            {invite.isPending && <Spinner data-icon="inline-start" />}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ownership offers have no list endpoint: owners/admins find the newest one through the activity
 * log; any member (including staff recipients) can look one up by the reference the owner shares.
 */
function OwnershipCard() {
  const t = useTranslations("settings.team");
  const qc = useQueryClient();
  const { account } = useBusiness();
  const manager = canManageOrganization(account.role);
  const latest = useLatestTransfer(manager);
  const members = useMembers({ size: 100 });
  const [reference, setReference] = useState("");
  const [looked, setLooked] = useState<OwnershipTransfer | null>(null);
  const [lookError, setLookError] = useState<unknown>(null);
  const [looking, setLooking] = useState(false);
  const nameOf = (id: string) => members.data?.items.find((m) => m.id === id)?.displayName ?? t("someone");
  const transfer = looked ?? latest.data ?? null;

  const lookUp = async () => {
    setLooking(true);
    setLookError(null);
    try {
      setLooked(await qc.fetchQuery(organizationQueries.transfer(reference.trim().toLowerCase())));
    } catch (e) {
      setLookError(e);
    } finally {
      setLooking(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("transfer.title")}</CardTitle>
        <CardDescription>{t("transfer.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {transfer && <TransferStatus transfer={transfer} recipientName={nameOf(transfer.recipientAccountId)} onChanged={() => setLooked(null)} />}
        {account.role !== "OWNER" && (!transfer || transfer.state !== "PENDING") && (
          <form
            className="flex max-w-md flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (isUuid(reference)) void lookUp();
            }}
          >
            <Field data-invalid={(!!reference && !isUuid(reference)) || undefined}>
              <FieldLabel htmlFor="transfer-ref">{t("transfer.haveReference")}</FieldLabel>
              <div className="flex gap-2">
                <Input id="transfer-ref" placeholder={t("transfer.enterReference")} value={reference} onChange={(e) => setReference(e.target.value)} />
                <Button type="submit" variant="outline" disabled={!isUuid(reference) || looking}>
                  {looking && <Spinner data-icon="inline-start" />}
                  {t("transfer.lookUp")}
                </Button>
              </div>
              {!!reference && !isUuid(reference) && <FieldError>{t("transfer.referenceInvalid")}</FieldError>}
              {!!lookError && (isApiError(lookError, "NOT_FOUND") ? <FieldError>{t("transfer.notFound")}</FieldError> : <FormError error={lookError} />)}
            </Field>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function TransferStatus({ transfer, recipientName, onChanged }: { transfer: OwnershipTransfer; recipientName: string; onChanged: () => void }) {
  const t = useTranslations("settings.team");
  const guarded = useGuarded();
  const errorText = useIdErrorText();
  const { account, organization } = useBusiness();
  const revoke = useRevokeTransfer();
  const accept = useAcceptTransfer();
  const isOwner = account.role === "OWNER";
  const isRecipient = transfer.recipientAccountId === account.id;

  if (transfer.state !== "PENDING") {
    return <p className="text-sm text-muted-foreground">{t("transfer.lastOffer", { name: recipientName, state: t(`transfer.states.${transfer.state}`) })}</p>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm">
        {isRecipient
          ? t("transfer.pendingRecipient", { org: organization.displayName, date: formatDateTime(transfer.expiresAt) })
          : t("transfer.pending", { name: recipientName, date: formatDateTime(transfer.expiresAt) })}
      </p>
      {isOwner && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("transfer.reference")}</span>
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{transfer.id}</code>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("transfer.copy")}
              onClick={() => void navigator.clipboard.writeText(transfer.id).then(() => toast.success(t("transfer.copied")))}
            >
              <CopyIcon />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">{t("transfer.referenceHint")}</span>
        </div>
      )}
      <FormError error={accept.error && !isApiError(accept.error, "REAUTHENTICATION_REQUIRED") ? accept.error : null} />
      <CardFooter className="gap-2 px-0">
        {isOwner && (
          <Button
            variant="outline"
            disabled={revoke.isPending}
            onClick={() =>
              revoke.mutate(
                { id: transfer.id, revision: transfer.revision },
                {
                  onSuccess: () => {
                    toast.success(t("transfer.revokedToast"));
                    onChanged();
                  },
                  onError: (e) => toast.error(errorText(e)),
                },
              )
            }
          >
            {t("transfer.revoke")}
          </Button>
        )}
        {isRecipient && (
          <Button
            disabled={accept.isPending}
            onClick={() =>
              void guarded(() => accept.mutateAsync({ id: transfer.id, revision: transfer.revision }))
                .then(() => {
                  // Both participants are signed out; the new owner logs in again.
                  toast.success(t("transfer.acceptedTitle"), { description: t("transfer.acceptedDescription") });
                  void sessionStore.expire();
                })
                .catch(() => undefined)
            }
          >
            {accept.isPending && <Spinner data-icon="inline-start" />}
            {t("transfer.accept")}
          </Button>
        )}
      </CardFooter>
    </div>
  );
}
