"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleDashedIcon, LogOutIcon } from "lucide-react";
import { emailChangeMemory, emailProblem, formatDateTime, isApiError, isEmailChangeFinished, type Account } from "@repo/core";
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
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { useIdErrorText, useFieldErrorText } from "@/features/auth/error-text";
import { ExternalButtons } from "@/features/auth/external-buttons";
import { useProblemText } from "@/features/org-admin/parts";
import { PasswordPairFields, usePasswordPair } from "@/features/auth/fields";
import { FormError } from "@/features/auth/form-error";
import { useGuarded } from "@/features/auth/reauth";
import { useSession, webStorage } from "@/lib/session";
import {
  useCancelEmailChange,
  useChangePassword,
  useCompleteEmailChange,
  useDeactivateSelf,
  useEmailChange,
  useExternalIdentities,
  useRequestEmailChange,
  useRevokeAllSessions,
  useRevokeSession,
  useSessions,
  useUnlinkExternalIdentity,
} from "./queries";

const emailChanges = emailChangeMemory(webStorage);

/** Password, login email, sessions, linked Google/Apple sign-in and (staff) self-deactivation. */
export function SecurityPanel() {
  const state = useSession();
  if (state.status !== "business" && state.status !== "admin") return null;
  return (
    <div className="flex flex-col gap-4">
      <PasswordCard />
      <EmailCard account={state.account} />
      <SessionsCard />
      <ExternalCard />
      {state.status === "business" && <DeactivateCard account={state.account} org={state.organization.displayName} />}
    </div>
  );
}

function PasswordCard() {
  const t = useTranslations("account.password");
  const guarded = useGuarded();
  const pair = usePasswordPair();
  const [attempted, setAttempted] = useState(false);
  const change = useChangePassword();
  const fieldError = useFieldErrorText();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            setAttempted(true);
            if (!pair.valid) return;
            void guarded(() => change.mutateAsync(pair.password))
              .then(() => {
                toast.success(t("changed"));
                pair.setPassword("");
                pair.setConfirm("");
                setAttempted(false);
              })
              .catch(() => undefined);
          }}
        >
          <FieldGroup>
            {change.error && !isApiError(change.error, "PASSWORD_REJECTED") && !isApiError(change.error, "REAUTHENTICATION_REQUIRED") && (
              <FormError error={change.error} />
            )}
            <PasswordPairFields pair={pair} attempted={attempted} idPrefix="change" serverError={fieldError(change.error, "newPassword")} />
            <div>
              <Button type="submit" disabled={change.isPending}>
                {change.isPending && <Spinner data-icon="inline-start" />}
                {t("submit")}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function EmailCard({ account }: { account: Account }) {
  const t = useTranslations("account.email");
  const router = useRouter();
  const guarded = useGuarded();
  const [changeId, setChangeId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [attempted, setAttempted] = useState(false);
  const change = useEmailChange(changeId);
  const request = useRequestEmailChange();
  const cancel = useCancelEmailChange();
  const complete = useCompleteEmailChange();
  const problemText = useProblemText();

  // The pending request id is remembered per account (there's no list endpoint).
  useEffect(() => {
    void emailChanges.get(account.id).then(setChangeId);
  }, [account.id]);

  const forget = () => {
    void emailChanges.clear(account.id);
    setChangeId(null);
  };

  const problem = emailProblem(newEmail, true) ?? (newEmail.trim().toLowerCase() === account.email.toLowerCase() ? "same" : null);
  const current = change.data;
  const active = current && !isEmailChangeFinished(current);

  if (complete.isSuccess) {
    return (
      <Card>
        <CardHeader>
          <CheckCircle2Icon className="size-6 text-primary" aria-hidden />
          <CardTitle>{t("completedTitle")}</CardTitle>
          <CardDescription>{t("completedDescription")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm">
          <span className="text-muted-foreground">{t("current")}: </span>
          <span className="font-medium">{account.email}</span>
        </p>
        {change.isError && !isApiError(change.error, "NOT_FOUND") && <ErrorState error={change.error} onRetry={() => void change.refetch()} />}
        {active ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{t("pendingTitle")}</p>
              <Badge variant="secondary">{t(`states.${current.state}`)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{t("expires", { date: formatDateTime(current.expiresAt) })}</p>
            <ul className="flex flex-col gap-1 text-sm">
              <ProofRow done={current.oldAddressVerified} label={current.oldAddressVerified ? t("oldVerified") : t("oldPending")} />
              <ProofRow done={current.newAddressVerified} label={current.newAddressVerified ? t("newVerified") : t("newPending")} />
            </ul>
            <FormError error={complete.error ?? cancel.error} />
            <p className="text-sm text-muted-foreground">{t("completeHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!current.oldAddressVerified || !current.newAddressVerified || complete.isPending}
                onClick={() =>
                  void guarded(() => complete.mutateAsync({ changeId: current.id, expectedRevision: current.revision }))
                    .then(() => {
                      forget();
                      router.replace("/login");
                    })
                    .catch(() => undefined)
                }
              >
                {complete.isPending && <Spinner data-icon="inline-start" />}
                {t("complete")}
              </Button>
              <Button variant="outline" onClick={() => void change.refetch()} disabled={change.isFetching}>
                {t("refresh")}
              </Button>
              {current.state === "PENDING" && (
                <Button
                  variant="ghost"
                  disabled={cancel.isPending}
                  onClick={() =>
                    cancel.mutate(
                      { changeId: current.id, expectedRevision: current.revision },
                      {
                        onSuccess: () => {
                          forget();
                          toast.success(t("cancelled"));
                        },
                      },
                    )
                  }
                >
                  {t("cancel")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form
            className="flex max-w-md flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setAttempted(true);
              if (problem) return;
              void guarded(() => request.mutateAsync({ newEmail: newEmail.trim(), expectedRevision: account.revision }))
                .then((created) => {
                  void emailChanges.set(account.id, created.id);
                  setChangeId(created.id);
                  setNewEmail("");
                  setAttempted(false);
                })
                .catch(() => undefined);
            }}
          >
            {request.error && !isApiError(request.error, "REAUTHENTICATION_REQUIRED") && <FormError error={request.error} />}
            <Field data-invalid={(attempted && !!problem) || undefined}>
              <FieldLabel htmlFor="new-email">{t("new")}</FieldLabel>
              <Input id="new-email" type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              {attempted && problem && <FieldError>{problem === "same" ? t("same") : problemText(problem)}</FieldError>}
            </Field>
            <div>
              <Button type="submit" disabled={request.isPending}>
                {request.isPending && <Spinner data-icon="inline-start" />}
                {t("start")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ProofRow({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {done ? <CheckCircle2Icon className="size-4 text-primary" aria-hidden /> : <CircleDashedIcon className="size-4 text-muted-foreground" aria-hidden />}
      {label}
    </li>
  );
}

function SessionsCard() {
  const t = useTranslations("account.sessions");
  const tc = useTranslations("common");
  const router = useRouter();
  const guarded = useGuarded();
  const errorText = useIdErrorText();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <LogOutIcon data-icon="inline-start" />
                {t("revokeAll")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("revokeAllTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("revokeAllDescription")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    void guarded(() => revokeAll.mutateAsync())
                      .then(() => router.replace("/login"))
                      .catch((e: unknown) => !isApiError(e, "REAUTHENTICATION_REQUIRED") && toast.error(errorText(e)))
                  }
                >
                  {t("revokeAllConfirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {sessions.isError ? (
          <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
        ) : sessions.isPending ? (
          <RowsSkeleton rows={2} />
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t("device")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("lastActive")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("expires")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.data.items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      {s.deviceLabel}
                      {s.current && <Badge variant="secondary">{t("current")}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{formatDateTime(s.lastActivityAt)}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatDateTime(s.expiresAt)}</TableCell>
                  <TableCell className="text-right">
                    {!s.current && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={revoke.isPending && revoke.variables === s.id}
                        onClick={() =>
                          revoke.mutate(s.id, { onSuccess: () => toast.success(t("revoked")), onError: (e) => toast.error(errorText(e)) })
                        }
                      >
                        {t("revoke")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ExternalCard() {
  const t = useTranslations("account.external");
  const tc = useTranslations("common");
  const router = useRouter();
  const guarded = useGuarded();
  const errorText = useIdErrorText();
  const identities = useExternalIdentities();
  const unlink = useUnlinkExternalIdentity();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {identities.isError ? (
          <ErrorState error={identities.error} onRetry={() => void identities.refetch()} />
        ) : identities.isPending ? (
          <RowsSkeleton rows={1} />
        ) : identities.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {identities.data.items.map((identity) => (
              <li key={identity.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{t(`providers.${identity.provider}`)}</span>
                  <span className="text-xs text-muted-foreground">{t("linkedOn", { date: formatDateTime(identity.createdAt) })}</span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {t("unlink")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("unlinkTitle", { provider: t(`providers.${identity.provider}`) })}</AlertDialogTitle>
                      <AlertDialogDescription>{t("unlinkDescription")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() =>
                          void guarded(() => unlink.mutateAsync(identity.id))
                            .then(() => {
                              toast.success(t("unlinked", { provider: t(`providers.${identity.provider}`) }));
                              router.replace("/login");
                            })
                            .catch((e: unknown) => !isApiError(e, "REAUTHENTICATION_REQUIRED") && toast.error(errorText(e)))
                        }
                      >
                        {t("unlink")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
        <div className="max-w-xs">
          <ExternalButtons purpose="LINK" guard={guarded} />
        </div>
      </CardContent>
    </Card>
  );
}

function DeactivateCard({ account, org }: { account: Account; org: string }) {
  const t = useTranslations("account.deactivate");
  const tc = useTranslations("common");
  const router = useRouter();
  const guarded = useGuarded();
  const errorText = useIdErrorText();
  const deactivate = useDeactivateSelf();
  const staff = account.role === "STAFF";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description", { org })}</CardDescription>
      </CardHeader>
      <CardFooter className="flex-col items-start gap-2">
        {!staff && <p className="text-sm text-muted-foreground">{t("notStaff")}</p>}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={!staff}>
              {t("button")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("confirmDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  void guarded(() => deactivate.mutateAsync(account.revision))
                    .then(() => router.replace("/login"))
                    .catch((e: unknown) => !isApiError(e, "REAUTHENTICATION_REQUIRED") && toast.error(errorText(e)))
                }
              >
                {t("confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}
