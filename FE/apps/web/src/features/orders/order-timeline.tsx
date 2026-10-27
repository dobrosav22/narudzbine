"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { formatDateTime, orderEventKind, pageItems, type Order, type OrderEvent } from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useOrderEvents } from "./queries";

/**
 * Actual immutable order history (GET /orders/{id}/events), oldest first. Individual actors are
 * shown only for the viewer's own organization; the counterparty appears as its organization.
 */
export function OrderTimeline({ order, ownOrganizationId }: { order: Order; ownOrganizationId: string }) {
  const t = useTranslations("orders.timeline");
  const events = useOrderEvents(order.id);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = events;
  // Histories are short; load every page so the timeline is complete.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const items = pageItems(events.data?.pages);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.isError ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} />
        ) : events.isPending ? (
          <RowsSkeleton rows={3} />
        ) : (
          <ol className="flex flex-col">
            {items.map((e, i) => (
              <li key={e.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", i === items.length - 1 ? "bg-success" : "bg-border")} />
                  {i < items.length - 1 && <span className="w-px flex-1 bg-border" />}
                </div>
                <EventRow event={e} order={order} ownOrganizationId={ownOrganizationId} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function EventRow({ event, order, ownOrganizationId }: { event: OrderEvent; order: Order; ownOrganizationId: string }) {
  const t = useTranslations("orders.timeline");
  const kind = orderEventKind(event);
  const own = event.actorOrganizationId === ownOrganizationId;
  const orgName = event.actorOrganizationId === order.vendor.organizationId ? order.vendor.displayName : order.buyer.displayName;
  const actor = own && event.ownActorDisplayName ? t("byPerson", { name: event.ownActorDisplayName, organization: orgName }) : orgName;
  const title =
    kind === "STAGE_SET"
      ? t("STAGE_SET", { stage: event.stageName ?? "—" })
      : kind === "STAGE_CLEARED"
        ? t("STAGE_CLEARED", { stage: event.previousStageName ?? "—" })
        : t(kind);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 pb-4">
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{`${formatDateTime(event.createdAt)} · ${actor}`}</span>
      {event.reason && <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{t("reason", { reason: event.reason })}</p>}
    </div>
  );
}
