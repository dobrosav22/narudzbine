"use client";

import { useState } from "react";
import { MoreHorizontalIcon, UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate, isApiError, type Account, type Organization, type Role } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGuarded } from "@/features/auth/reauth";
import { FilterSelect, Pager, ReasonDialog } from "./parts";
import { useAdminMembers, useSetStaffActive } from "./queries";
import { CreateRecoveryCaseDialog } from "./recovery";

const PAGE_SIZE = 25;
const ROLES: Role[] = ["OWNER", "ADMIN", "STAFF"];
const ACCOUNT_STATE_BADGE: Record<Account["state"], "success" | "secondary" | "info"> = { ACTIVE: "success", DEACTIVATED: "secondary", PENDING: "info" };

/**
 * Member accounts (adminListMembers). Platform administrators may only contain STAFF
 * (deactivate/reactivate with a reason); owner/admin roles and ownership change through the
 * organization itself or the exceptional recovery procedure started here.
 */
export function MembersPanel({ org }: { org: Organization }) {
  const t = useTranslations("admin.members");
  const ta = useTranslations("admin");
  const [state, setState] = useState<"ACTIVE" | "DEACTIVATED" | "">("");
  const [role, setRole] = useState<Role | "">("");
  const [page, setPage] = useState(0);
  const [staffAction, setStaffAction] = useState<{ account: Account; active: boolean } | null>(null);
  const [recovery, setRecovery] = useState<{ account: Account; kind: "OWNER" | "EMAIL" } | null>(null);
  const members = useAdminMembers(org.id, { page, size: PAGE_SIZE, includeTotal: true, ...(state ? { state } : {}), ...(role ? { role } : {}) });
  const closed = org.state === "CLOSED";
  const recoveryAllowed = org.state === "ACTIVE";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label={t("state")}
            value={state}
            onChange={(v) => {
              setState(v);
              setPage(0);
            }}
            options={[
              { value: "ACTIVE", label: ta("accountState.ACTIVE") },
              { value: "DEACTIVATED", label: ta("accountState.DEACTIVATED") },
            ]}
            allLabel={t("allStates")}
          />
          <FilterSelect
            label={t("role")}
            value={role}
            onChange={(v) => {
              setRole(v);
              setPage(0);
            }}
            options={ROLES.map((r) => ({ value: r, label: ta(`role.${r}`) }))}
            allLabel={t("allRoles")}
          />
        </div>
        {members.isError ? (
          <ErrorState error={members.error} onRetry={() => void members.refetch()} />
        ) : members.isPending ? (
          <RowsSkeleton rows={3} />
        ) : members.data.items.length === 0 ? (
          <EmptyState icon={UsersIcon} title={t("none")} />
        ) : (
          <>
            <Table className="text-sm" aria-label={t("title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("person")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead>{t("state")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("since")}</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data.items.map((m) => {
                  const isStaff = m.role === "STAFF";
                  const canDeactivate = isStaff && m.state === "ACTIVE" && !closed;
                  const canReactivate = isStaff && m.state === "DEACTIVATED" && !closed;
                  const canOwnerRecovery = recoveryAllowed && m.state === "ACTIVE" && m.role !== "OWNER";
                  const canEmailRecovery = recoveryAllowed && m.state === "ACTIVE";
                  const any = canDeactivate || canReactivate || canOwnerRecovery || canEmailRecovery;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-normal">
                        <div className="font-medium">{m.displayName}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </TableCell>
                      <TableCell>{m.role ? ta(`role.${m.role}`) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={ACCOUNT_STATE_BADGE[m.state]}>{ta(`accountState.${m.state}`)}</Badge>
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
                              {canDeactivate && (
                                <DropdownMenuItem variant="destructive" onSelect={() => setStaffAction({ account: m, active: false })}>
                                  {t("deactivate")}
                                </DropdownMenuItem>
                              )}
                              {canReactivate && <DropdownMenuItem onSelect={() => setStaffAction({ account: m, active: true })}>{t("reactivate")}</DropdownMenuItem>}
                              {(canDeactivate || canReactivate) && (canOwnerRecovery || canEmailRecovery) && <DropdownMenuSeparator />}
                              {canOwnerRecovery && <DropdownMenuItem onSelect={() => setRecovery({ account: m, kind: "OWNER" })}>{t("ownerRecovery")}</DropdownMenuItem>}
                              {canEmailRecovery && <DropdownMenuItem onSelect={() => setRecovery({ account: m, kind: "EMAIL" })}>{t("emailRecovery")}</DropdownMenuItem>}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Pager page={page} size={PAGE_SIZE} total={members.data.total} count={members.data.items.length} onPage={setPage} />
          </>
        )}
        <p className="text-xs text-muted-foreground">{t("staffOnlyNote")}</p>
      </CardContent>

      <StaffDialog org={org} action={staffAction} onClose={() => setStaffAction(null)} />
      <CreateRecoveryCaseDialog org={org} target={recovery?.account ?? null} kind={recovery?.kind ?? "OWNER"} onClose={() => setRecovery(null)} />
    </Card>
  );
}

function StaffDialog({ org, action, onClose }: { org: Organization; action: { account: Account; active: boolean } | null; onClose: () => void }) {
  const t = useTranslations("admin.members");
  const mutation = useSetStaffActive(org.id);
  const qc = useQueryClient();
  const guarded = useGuarded();
  const name = action?.account.displayName ?? "";

  async function confirm(reason: string) {
    if (!action) return;
    try {
      await guarded(() =>
        mutation.mutateAsync({
          organizationId: org.id,
          accountId: action.account.id,
          active: action.active,
          body: { expectedRevision: action.account.revision, reason },
        }),
      );
      toast.success(action.active ? t("reactivated", { name }) : t("deactivated", { name }));
      mutation.reset();
      onClose();
    } catch (e) {
      // Inline error. A stale account revision: refresh the list; the operator reopens the action.
      if (isApiError(e, "REVISION_CONFLICT")) void qc.invalidateQueries({ queryKey: ["admin", "organization", org.id, "members"] });
    }
  }

  return (
    <ReasonDialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) {
          mutation.reset();
          onClose();
        }
      }}
      title={action?.active ? t("reactivateTitle", { name }) : t("deactivateTitle", { name })}
      description={action?.active ? t("reactivateDescription") : t("deactivateDescription")}
      confirmLabel={action?.active ? t("reactivate") : t("deactivate")}
      destructive={!action?.active}
      pending={mutation.isPending}
      error={mutation.error}
      errorMessages={{ REQUEST_IN_PROGRESS: t("credentialPending"), INVALID_STATE: t("invalidState"), REVISION_CONFLICT: t("stale") }}
      onConfirm={(reason) => void confirm(reason)}
    />
  );
}
