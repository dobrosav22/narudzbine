"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardListIcon } from "lucide-react";
import {
  formatDate,
  formatMoney,
  formatNumber,
  isOpenOrder,
  ORDER_DATE_RANGES,
  orderNumber,
  orderRangeStart,
  orderTotal,
  statusLabel,
  type OrderDateRange,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StatusBadge } from "@/features/orders/status-badge";
import { useVendorOrderContext, useVendorOrders } from "./queries";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

const ALL = "all";
const OPEN = "__open";

/** 03 → vendor "Orders (list)": filter by status, location, buyer, date range. */
export function VendorOrdersScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useTranslations("vendorOrders");
  const to = useTranslations("orders");
  const tm = useMsg();
  const router = useRouter();
  const [status, setStatus] = useState(ALL);
  const [buyerOrgId, setBuyerOrgId] = useState(ALL);
  const [locationId, setLocationId] = useState(ALL);
  const [range, setRange] = useState<OrderDateRange>("all");
  // Computed when the range is picked (an event), not during render.
  const [from, setFrom] = useState<string>();
  const ctx = useVendorOrderContext(vendorOrgId);
  const orders = useVendorOrders(vendorOrgId, {
    statusKey: status === ALL || status === OPEN ? undefined : status,
    buyerOrgId: buyerOrgId === ALL ? undefined : buyerOrgId,
    locationId: locationId === ALL ? undefined : locationId,
    from,
  });
  const rows = ctx.data && orders.data ? (status === OPEN ? orders.data.filter((o) => isOpenOrder(ctx.data.config, o)) : orders.data) : undefined;
  const filtering = status !== ALL || buyerOrgId !== ALL || locationId !== ALL || range !== "all";
  const failed = ctx.isError ? ctx : orders.isError ? orders : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{to("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {rows ? t("count", { count: rows.length, countText: formatNumber(rows.length) }) : " "}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" aria-label={to("filterStatus")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{to("allStatuses")}</SelectItem>
              <SelectItem value={OPEN}>{t("open")}</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t("yourStatuses")}</SelectLabel>
              {ctx.data?.config.statuses.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {tm(statusLabel(s))}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={buyerOrgId} onValueChange={setBuyerOrgId}>
          <SelectTrigger className="w-52" aria-label={t("filterBuyer")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{t("allBuyers")}</SelectItem>
              {[...(ctx.data?.buyers.values() ?? [])].map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {ctx.data && ctx.data.vendorLocations.size > 1 && (
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="w-56" aria-label={t("filterWarehouse")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>{t("allWarehouses")}</SelectItem>
                {[...ctx.data.vendorLocations.values()].map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        <ToggleGroup
          type="single"
          variant="outline"
          value={range}
          aria-label={t("dateRange")}
          onValueChange={(v) => {
            if (!v) return;
            setRange(v as OrderDateRange);
            setFrom(orderRangeStart(v as OrderDateRange));
          }}
        >
          {ORDER_DATE_RANGES.map((r) => (
            <ToggleGroupItem key={r.value} value={r.value}>
              {tm({ key: r.labelKey })}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {failed ? (
        <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
      ) : !rows || !ctx.data ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardListIcon}
          title={filtering ? to("noMatchesTitle") : to("emptyTitle")}
          description={filtering ? t("noMatchesDescription") : t("emptyDescription")}
        />
      ) : (
        <div className="rounded-lg border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{to("order")}</TableHead>
                <TableHead>{to("placed")}</TableHead>
                <TableHead>{t("buyer")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("deliverTo")}</TableHead>
                <TableHead className="hidden md:table-cell text-right">{t("items")}</TableHead>
                <TableHead className="text-right">{t("total")}</TableHead>
                <TableHead className="text-right">{to("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`/vendor/orders/${o.id}`)}>
                  <TableCell>
                    <Link href={`/vendor/orders/${o.id}`} className="font-mono font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {orderNumber(o)}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(o.createdAt)}</TableCell>
                  <TableCell>{ctx.data.buyers.get(o.buyerOrgId)?.name ?? t("formerBuyer")}</TableCell>
                  <TableCell className="hidden lg:table-cell">{ctx.data.buyerLocations.get(o.locationId)?.name ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono tabular-nums">
                    {formatNumber(o.items.reduce((n, i) => n + i.quantity, 0))}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatMoney(orderTotal(o))}</TableCell>
                  <TableCell className="text-right">
                    <StatusBadge config={ctx.data.config} statusKey={o.statusKey} />
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
