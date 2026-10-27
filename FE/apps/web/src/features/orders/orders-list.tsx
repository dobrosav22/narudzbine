"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardListIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  formatDate,
  formatMoney,
  formatNumber,
  isValidDateRange,
  localToday,
  orderDateRange,
  orderItemCount,
  orderPartner,
  ORDER_DATE_PRESETS,
  ORDER_STATES,
  pageItems,
  type OrderDatePreset,
  type OrderState,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useOrderList, useOrderPartners } from "./queries";
import { OrderStateBadge } from "./state-badge";

const ALL = "all";
type Range = OrderDatePreset | "custom";

/**
 * Order history for either side (GET /orders): state, trading partner and country-local date
 * filters, cursor-paged ("Load more"). Partner names come from each order's frozen PartySnapshot,
 * so disconnected partners' history still reads correctly.
 */
export function OrdersList({ side, basePath, emptyAction }: { side: "BUYER" | "VENDOR"; basePath: string; emptyAction?: React.ReactNode }) {
  const t = useTranslations("orders");
  const ts = useTranslations("ordState");
  const router = useRouter();
  // Deep links (dashboard, partner detail) preselect filters: ?state=AWAITING_ACCEPTANCE&partnerId=…
  const params = useSearchParams();
  const linkedState = params.get("state");
  const [state, setState] = useState<OrderState | typeof ALL>(
    ORDER_STATES.includes(linkedState as OrderState) ? (linkedState as OrderState) : ALL,
  );
  const [partnerId, setPartnerId] = useState(params.get("partnerId") ?? ALL);
  const [range, setRange] = useState<Range>("all");
  const [dates, setDates] = useState<{ from?: string; to?: string }>({});
  const partners = useOrderPartners();
  const validRange = isValidDateRange(dates);
  const filter = {
    state: state === ALL ? undefined : state,
    partnerId: partnerId === ALL ? undefined : partnerId,
    ...(validRange ? dates : {}),
  };
  const orders = useOrderList(filter, validRange);
  const rows = pageItems(orders.data?.pages);
  const filtering = state !== ALL || partnerId !== ALL || range !== "all";
  const partnerLabel = side === "BUYER" ? t("vendor") : t("buyer");

  const pickRange = (value: string) => {
    if (!value) return;
    const next = value as Range;
    setRange(next);
    // Dates are computed on the event (country-local today), not during render.
    if (next !== "custom") setDates(orderDateRange(next, localToday()));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={state} onValueChange={(v) => setState(v as OrderState | typeof ALL)}>
          <SelectTrigger className="w-48" aria-label={t("filterState")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{t("allStates")}</SelectItem>
              {ORDER_STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {ts(s)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={partnerId} onValueChange={setPartnerId}>
          <SelectTrigger className="w-56" aria-label={side === "BUYER" ? t("filterVendor") : t("filterBuyer")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>{side === "BUYER" ? t("allVendors") : t("allBuyers")}</SelectItem>
              {partners.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.relationshipState === "DISCONNECTED" ? t("partnerDisconnected", { name: p.displayName }) : p.displayName}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <ToggleGroup type="single" variant="outline" value={range} aria-label={t("dateRange")} onValueChange={pickRange}>
          {ORDER_DATE_PRESETS.map((p) => (
            <ToggleGroupItem key={p} value={p}>
              {t(`range.${p}`)}
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="custom">{t("range.custom")}</ToggleGroupItem>
        </ToggleGroup>
        {range === "custom" && (
          <div className="flex items-end gap-2">
            <Field className="w-40">
              <FieldLabel htmlFor="orders-from">{t("from")}</FieldLabel>
              <Input
                id="orders-from"
                type="date"
                value={dates.from ?? ""}
                aria-invalid={!validRange || undefined}
                onChange={(e) => setDates((d) => ({ ...d, from: e.target.value || undefined }))}
              />
            </Field>
            <Field className="w-40">
              <FieldLabel htmlFor="orders-to">{t("to")}</FieldLabel>
              <Input
                id="orders-to"
                type="date"
                value={dates.to ?? ""}
                aria-invalid={!validRange || undefined}
                onChange={(e) => setDates((d) => ({ ...d, to: e.target.value || undefined }))}
              />
            </Field>
          </div>
        )}
      </div>
      {!validRange && <p className="text-sm text-destructive">{t("rangeReversed")}</p>}

      {orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : orders.isPending ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardListIcon}
          title={filtering ? t("noMatchesTitle") : t("emptyTitle")}
          description={filtering ? t("noMatchesDescription") : side === "BUYER" ? t("emptyBuyer") : t("emptyVendor")}
        >
          {!filtering && emptyAction}
        </EmptyState>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("order")}</TableHead>
                  <TableHead>{t("submitted")}</TableHead>
                  <TableHead>{partnerLabel}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("deliverTo")}</TableHead>
                  <TableHead className="hidden md:table-cell text-right">{t("quantity")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                  <TableHead className="text-right">{t("state")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => router.push(`${basePath}/${o.id}`)}>
                    <TableCell>
                      <Link href={`${basePath}/${o.id}`} className="font-mono font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {o.number}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(o.submittedAt)}</TableCell>
                    <TableCell>{orderPartner(o, side).displayName}</TableCell>
                    <TableCell className="hidden lg:table-cell">{`${o.deliveryAddress.line1}, ${o.deliveryAddress.city}`}</TableCell>
                    <TableCell className="hidden md:table-cell text-right font-mono tabular-nums">{formatNumber(orderItemCount(o))}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatMoney(o.goodsTotal, o.currency)}</TableCell>
                    <TableCell className="text-right">
                      <OrderStateBadge state={o.state} stageName={o.stageName} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{t("netNote")}</span>
            {orders.hasNextPage && (
              <Button variant="outline" disabled={orders.isFetchingNextPage} onClick={() => void orders.fetchNextPage()}>
                {orders.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                {t("loadMore")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
