"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardListIcon } from "lucide-react";
import { formatDate, formatMoney, formatNumber, orderNumber, orderTotal, statusLabel } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCart } from "@/lib/cart";
import { useSignedIn } from "@/lib/session";
import { useBuyerLocations, useBuyerOrders, useBuyerUsers, useStatusConfig } from "./queries";
import { StatusBadge } from "./status-badge";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

const ALL = "all";

/** 03 → buyer "Order history": this buyer org's orders with the active vendor, filterable by location and status. */
export function OrdersScreen() {
  const t = useTranslations("orders");
  const tc = useTranslations("cart");
  const tm = useMsg();
  const router = useRouter();
  const { membership, activeVendor } = useSignedIn();
  const { scope } = useCart();
  const [locationId, setLocationId] = useState(ALL);
  const [statusKey, setStatusKey] = useState(ALL);
  const orders = useBuyerOrders(scope, {
    locationId: locationId === ALL ? undefined : locationId,
    statusKey: statusKey === ALL ? undefined : statusKey,
  });
  const config = useStatusConfig(activeVendor?.id ?? "");
  const locations = useBuyerLocations(membership.org.id);
  const users = useBuyerUsers(membership.org.id);
  const locationName = useMemo(() => new Map(locations.data?.map((l) => [l.id, l.name])), [locations.data]);
  const userName = useMemo(() => new Map(users.data?.map((u) => [u.id, u.name])), [users.data]);
  const filtering = locationId !== ALL || statusKey !== ALL;

  if (!activeVendor) {
    return <EmptyState icon={ClipboardListIcon} title={t("noVendorsTitle")} description={t("noVendorsDescription")} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("with", { vendor: activeVendor.name })}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="w-52" aria-label={t("filterLocation")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{t("allLocations")}</SelectItem>
              {locations.data?.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={statusKey} onValueChange={setStatusKey}>
          <SelectTrigger className="w-44" aria-label={t("filterStatus")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
              {config.data?.statuses.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {tm(statusLabel(s))}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.isPending ? (
        <RowsSkeleton />
      ) : orders.data.length === 0 ? (
        <EmptyState
          icon={ClipboardListIcon}
          title={filtering ? t("noMatchesTitle") : t("emptyTitle")}
          description={filtering ? t("noMatchesDescription") : t("emptyDescription", { vendor: activeVendor.name })}
        >
          {!filtering && (
            <Button asChild variant="outline">
              <Link href="/buyer">{tc("browse")}</Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="rounded-lg border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t("order")}</TableHead>
                <TableHead>{t("placed")}</TableHead>
                <TableHead className="hidden md:table-cell">{tc("deliverTo")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("placedBy")}</TableHead>
                <TableHead className="text-right">{tc("items")}</TableHead>
                <TableHead className="text-right">{tc("total")}</TableHead>
                <TableHead className="text-right">{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.data.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/buyer/orders/${o.id}`)}>
                  <TableCell>
                    <Link href={`/buyer/orders/${o.id}`} className="font-mono font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {orderNumber(o)}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(o.createdAt)}</TableCell>
                  <TableCell className="hidden md:table-cell">{locationName.get(o.locationId) ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{userName.get(o.createdByUserId) ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(o.items.reduce((n, i) => n + i.quantity, 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(orderTotal(o))}</TableCell>
                  <TableCell className="text-right">
                    <StatusBadge config={config.data} statusKey={o.statusKey} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
