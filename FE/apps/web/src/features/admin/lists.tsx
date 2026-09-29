"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2Icon, UsersIcon } from "lucide-react";
import { formatDate, formatNumber } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { matches, SearchBox, UsageCell } from "./parts";
import { useAdminBuyers, useAdminVendors } from "./queries";
import { useTranslations } from "next-intl";

/** 03 v1.1 → "Vendors list": every VendorOrg, searchable, tier and usage at a glance. */
export function AdminVendorsScreen() {
  const t = useTranslations("admin");
  const router = useRouter();
  const vendors = useAdminVendors();
  const [query, setQuery] = useState("");
  const rows = vendors.data?.filter((v) => matches(v.vendorOrg.name, query));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("vendors")}</h1>
        <p className="text-sm text-muted-foreground">{vendors.data ? t("vendorCount", { count: vendors.data.length, countText: formatNumber(vendors.data.length) }) : " "}</p>
      </div>
      <SearchBox value={query} onChange={setQuery} label={t("searchVendors")} />
      {vendors.isError ? (
        <ErrorState error={vendors.error} onRetry={() => void vendors.refetch()} />
      ) : vendors.isPending ? (
        <RowsSkeleton />
      ) : rows!.length === 0 ? (
        <EmptyState icon={Building2Icon} title={query ? t("noMatchingVendors") : t("noVendors")} />
      ) : (
        <div className="rounded-lg border">
          <Table className="text-sm" aria-label={t("vendors")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("vendor")}</TableHead>
                <TableHead>{t("plan")}</TableHead>
                <TableHead className="text-right">{t("products")}</TableHead>
                <TableHead className="text-right">{t("buyers")}</TableHead>
                <TableHead className="hidden md:table-cell text-right">{t("since")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows!.map((v) => (
                <TableRow key={v.vendorOrg.id} className="cursor-pointer" onClick={() => router.push(`/admin/vendors/${v.vendorOrg.id}`)}>
                  <TableCell>
                    <Link href={`/admin/vendors/${v.vendorOrg.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
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
                  <TableCell className="hidden md:table-cell text-right">{formatDate(v.vendorOrg.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** 03 v1.1 → "Buyers list": every BuyerOrg, searchable. */
export function AdminBuyersScreen() {
  const t = useTranslations("admin");
  const router = useRouter();
  const buyers = useAdminBuyers();
  const [query, setQuery] = useState("");
  const rows = buyers.data?.filter((b) => matches(b.buyerOrg.name, query));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("buyers")}</h1>
        <p className="text-sm text-muted-foreground">{buyers.data ? t("buyerCount", { count: buyers.data.length, countText: formatNumber(buyers.data.length) }) : " "}</p>
      </div>
      <SearchBox value={query} onChange={setQuery} label={t("searchBuyers")} />
      {buyers.isError ? (
        <ErrorState error={buyers.error} onRetry={() => void buyers.refetch()} />
      ) : buyers.isPending ? (
        <RowsSkeleton />
      ) : rows!.length === 0 ? (
        <EmptyState icon={UsersIcon} title={query ? t("noMatchingBuyers") : t("noBuyers")} />
      ) : (
        <div className="rounded-lg border">
          <Table className="text-sm" aria-label={t("buyers")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("buyer")}</TableHead>
                <TableHead className="text-right">{t("vendors")}</TableHead>
                <TableHead className="text-right">{t("users")}</TableHead>
                <TableHead className="hidden sm:table-cell text-right">{t("locations")}</TableHead>
                <TableHead className="hidden md:table-cell text-right">{t("since")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows!.map((b) => (
                <TableRow key={b.buyerOrg.id} className="cursor-pointer" onClick={() => router.push(`/admin/buyers/${b.buyerOrg.id}`)}>
                  <TableCell>
                    <Link href={`/admin/buyers/${b.buyerOrg.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {b.buyerOrg.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatNumber(b.connectedVendorCount)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatNumber(b.userCount)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right font-mono tabular-nums">{formatNumber(b.locationCount)}</TableCell>
                  <TableCell className="hidden md:table-cell text-right">{formatDate(b.buyerOrg.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
