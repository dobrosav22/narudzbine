"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { formatDate, formatMoney, formatNumber, isAtLimit, usageLine, USE_MOCKS } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useVendorPlan } from "@/features/vendor-catalogue/queries";
import { useBuyerRows } from "@/features/vendor-orders/queries";
import { PlanLimitNotice } from "@/features/subscription/plan-limit";
import { InviteBuyerDialog, InviteLink } from "./invite-dialog";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

/** 03 → vendor "Buyers": connected buyer orgs, pending invites, invite form. */
export function BuyersScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("vendorBuyers");
  const tm = useMsg();
  const router = useRouter();
  const rows = useBuyerRows(vendorOrgId);
  const usage = useVendorPlan(vendorOrgId);
  const atLimit = isAtLimit(usage.data, "buyers");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {usage.data ? t("usage", { line: tm(usageLine(usage.data, "buyers")) }) : " "}
          </p>
        </div>
        {/* v1.1 hard block: usage is checked first; at or over maxBuyers the invite can't be opened. */}
        <InviteBuyerDialog vendorOrgId={vendorOrgId} blocked={!usage.data || atLimit} />
      </div>

      {usage.data && atLimit && <PlanLimitNotice plan={usage.data} limit="buyers" />}

      {rows.isError ? (
        <ErrorState error={rows.error} onRetry={() => void rows.refetch()} />
      ) : rows.isPending ? (
        <RowsSkeleton />
      ) : rows.data.length === 0 ? (
        <EmptyState icon={UsersIcon} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="rounded-lg border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t("buyer")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("orders")}</TableHead>
                <TableHead className="text-right">{t("spend")}</TableHead>
                <TableHead className="hidden md:table-cell text-right">{t("lastOrder")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.data.map((r) => {
                const href = r.buyerOrg ? `/vendor/buyers/${r.buyerOrg.id}` : undefined;
                return (
                  <TableRow
                    key={r.buyerOrg?.id ?? r.invite?.id}
                    className={href ? "cursor-pointer" : undefined}
                    onClick={href ? () => router.push(href) : undefined}
                  >
                    <TableCell>
                      {href ? (
                        <Link href={href} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {r.name}
                        </Link>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <span className="font-mono text-xs">{r.name}</span>
                          {USE_MOCKS && r.invite && <InviteLink invite={r.invite} />}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.kind === "connected" ? (
                        <Badge variant="success">{t("connected")}</Badge>
                      ) : (
                        <Badge variant="info">{r.invite ? t("inviteSentOn", { date: formatDate(r.invite.sentAt) }) : t("inviteSent")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.stats ? formatNumber(r.stats.orderCount) : "—"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.stats ? formatMoney(r.stats.spend) : "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-right">{r.stats?.lastOrderAt ? formatDate(r.stats.lastOrderAt) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
