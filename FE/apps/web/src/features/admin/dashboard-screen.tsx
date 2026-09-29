"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { InboxIcon } from "lucide-react";
import { formatDate, formatNumber, isAtLimit } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/features/stats/stat-parts";
import { UsageCell } from "./parts";
import { useAdminSummary, useAdminVendors, usePendingRequests, useTiers } from "./queries";
import { useTranslations } from "next-intl";

/**
 * 03 v1.1 → "Admin dashboard": platform totals (vendors, buyers, users). Also the pending
 * upgrade-request queue and vendors at their limits — the two things an admin acts on.
 */
export function AdminDashboardScreen() {
  const t = useTranslations("admin");
  const router = useRouter();
  const summary = useAdminSummary();
  const pending = usePendingRequests();
  const vendors = useAdminVendors();
  const tiers = useTiers();
  const vendorName = new Map(vendors.data?.map((v) => [v.vendorOrg.id, v.vendorOrg.name]));
  const tierName = new Map(tiers.data?.map((tier) => [tier.id, tier.name]));
  const currentTier = new Map(vendors.data?.map((v) => [v.vendorOrg.id, v.tier.name]));
  const atLimits = vendors.data?.filter((v) => isAtLimit(v.usage, "products") || isAtLimit(v.usage, "buyers")) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("platform")}</h1>
        <p className="text-sm text-muted-foreground">{t("platformSubtitle")}</p>
      </div>

      {summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label={t("loading")}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("vendors")} value={formatNumber(summary.data.vendorCount)} footer={t("allVendors")} href="/admin/vendors" />
          <StatCard label={t("buyers")} value={formatNumber(summary.data.buyerCount)} footer={t("allBuyers")} href="/admin/buyers" />
          <StatCard label={t("users")} value={formatNumber(summary.data.userCount)} footer={t("usersFooter")} />
          <StatCard label={t("requestsWaiting")} value={formatNumber(summary.data.pendingUpgradeRequests)} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("requestsWaiting")}</CardTitle>
          <CardDescription>{t("requestsWaitingDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.isError ? (
            <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />
          ) : pending.isPending ? (
            <RowsSkeleton rows={2} />
          ) : pending.data.length === 0 ? (
            <EmptyState icon={InboxIcon} title={t("nothingWaiting")} description={t("nothingWaitingDescription")} />
          ) : (
            <Table className="text-sm" aria-label={t("requestsWaiting")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("vendor")}</TableHead>
                  <TableHead>{t("change")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("note")}</TableHead>
                  <TableHead className="text-right">{t("sent")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.data.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/admin/vendors/${r.vendorOrgId}`)}>
                    <TableCell>
                      <Link href={`/admin/vendors/${r.vendorOrgId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {vendorName.get(r.vendorOrgId) ?? "…"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {currentTier.get(r.vendorOrgId) ?? "…"} → {tierName.get(r.requestedTierId) ?? "…"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell whitespace-normal text-muted-foreground">{r.message ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatDate(r.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("atLimitTitle")}</CardTitle>
          <CardDescription>{t("atLimitDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {vendors.isError ? (
            <ErrorState error={vendors.error} onRetry={() => void vendors.refetch()} />
          ) : vendors.isPending ? (
            <RowsSkeleton rows={2} />
          ) : atLimits.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noneAtLimit")}</p>
          ) : (
            <Table className="text-sm" aria-label={t("atLimitTitle")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("vendor")}</TableHead>
                  <TableHead>{t("plan")}</TableHead>
                  <TableHead className="text-right">{t("products")}</TableHead>
                  <TableHead className="text-right">{t("buyers")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atLimits.map((v) => (
                  <TableRow key={v.vendorOrg.id}>
                    <TableCell>
                      <Link href={`/admin/vendors/${v.vendorOrg.id}`} className="font-medium hover:underline">
                        {v.vendorOrg.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-2">
                        {v.tier.name}
                        {v.hasPendingRequest && <Badge variant="info">{t("upgradeRequested")}</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <UsageCell used={v.usage.productCount} max={v.usage.maxProducts} label={t("products")} />
                    </TableCell>
                    <TableCell className="text-right">
                      <UsageCell used={v.usage.buyerCount} max={v.usage.maxBuyers} label={t("buyers")} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
