"use client";

import Link from "next/link";
import { ArrowLeftIcon, UsersIcon } from "lucide-react";
import { formatDate, formatNumber, isServiceError } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/features/stats/stat-parts";
import { ConnectionsCard } from "./connections";
import { useAdminBuyer, useAdminVendors } from "./queries";
import { useTranslations } from "next-intl";

/** 03 v1.1 → "Buyer detail": which vendors this buyer org is connected to, with link/unlink. */
export function AdminBuyerDetailScreen({ buyerOrgId }: { buyerOrgId: string }) {
  const t = useTranslations("admin");
  const detail = useAdminBuyer(buyerOrgId);
  const vendors = useAdminVendors();

  if (detail.isError) {
    return isServiceError(detail.error, "NOT_FOUND") ? (
      <EmptyState icon={UsersIcon} title={t("buyerNotFound")}>
        <Button asChild variant="outline">
          <Link href="/admin/buyers">{t("allBuyers")}</Link>
        </Button>
      </EmptyState>
    ) : (
      <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
    );
  }
  if (detail.isPending) return <RowsSkeleton rows={5} />;
  const d = detail.data;
  const connectedIds = new Set(d.connections.map((c) => c.vendorOrg.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToBuyers")}>
          <Link href="/admin/buyers">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{d.buyerOrg.name}</h1>
          <p className="text-sm text-muted-foreground">{t("buyerSince", { date: formatDate(d.buyerOrg.createdAt) })}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("connectedVendors")} value={formatNumber(d.connectedVendorCount)} />
        <StatCard label={t("users")} value={formatNumber(d.userCount)} />
        <StatCard label={t("deliveryLocations")} value={formatNumber(d.locationCount)} />
      </div>

      <ConnectionsCard
        title={t("connectedVendors")}
        description={t("connectedVendorsDescription")}
        side="buyer"
        selfId={d.buyerOrg.id}
        selfName={d.buyerOrg.name}
        rows={d.connections.map((c) => ({ relation: c.relation, other: { id: c.vendorOrg.id, name: c.vendorOrg.name, href: `/admin/vendors/${c.vendorOrg.id}` } }))}
        candidates={(vendors.data ?? []).filter((v) => !connectedIds.has(v.vendorOrg.id)).map((v) => ({ id: v.vendorOrg.id, name: v.vendorOrg.name }))}
        linkHint={t("linkHintBuyer")}
      />
    </div>
  );
}
