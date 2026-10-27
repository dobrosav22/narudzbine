"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileClockIcon } from "lucide-react";
import { AUDIT_ACTIONS, canManageOrganization, formatDateTime, isKnownAuditAction } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { useBusiness } from "@/lib/session";
import { useAudit, useMembers } from "./queries";

const ALL = "all";

/** Safe own-organization activity log (owner/admin). Values are never shown; only changed field names. */
export function AuditPanel() {
  const t = useTranslations();
  const { account } = useBusiness();
  const allowed = canManageOrganization(account.role);
  const [action, setAction] = useState<string>(ALL);
  const audit = useAudit(action === ALL ? null : action, allowed);
  const members = useMembers({ size: 100 });
  const label = (a: string) => (isKnownAuditAction(a) ? t(`orgAudit.${a}`) : a);
  const who = (id: string | null) => (id && members.data?.items.find((m) => m.id === id)?.displayName) || t("settings.audit.partnerOrSystem");
  const rows = audit.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.audit.title")}</CardTitle>
        <CardDescription>{allowed ? t("settings.audit.description") : t("settings.audit.staffNote")}</CardDescription>
        {allowed && (
          <CardAction>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-60" aria-label={t("settings.audit.filter")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ALL}>{t("settings.audit.allActions")}</SelectItem>
                  {AUDIT_ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {label(a)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </CardAction>
        )}
      </CardHeader>
      {allowed && (
        <CardContent className="flex flex-col gap-3">
          {audit.isError ? (
            <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
          ) : audit.isPending ? (
            <RowsSkeleton rows={8} />
          ) : rows.length === 0 ? (
            <EmptyState icon={FileClockIcon} title={t("settings.audit.empty")} />
          ) : (
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.audit.when")}</TableHead>
                  <TableHead>{t("settings.audit.action")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("settings.audit.who")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("settings.audit.details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell className="font-medium">{label(e.action)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{who(e.actorAccountId)}</TableCell>
                    <TableCell className="hidden whitespace-normal text-muted-foreground md:table-cell">
                      {e.changedFields.length > 0 && <span className="block">{t("settings.audit.changed", { fields: e.changedFields.join(", ") })}</span>}
                      {e.reason && <span className="block">{t("settings.audit.reason", { reason: e.reason })}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {audit.hasNextPage && (
            <Button variant="outline" className="self-center" disabled={audit.isFetchingNextPage} onClick={() => void audit.fetchNextPage()}>
              {audit.isFetchingNextPage && <Spinner data-icon="inline-start" />}
              {t("settings.loadMore")}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
