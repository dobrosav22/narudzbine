"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellIcon, CheckIcon } from "lucide-react";
import { formatDateTime, type Notification } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { useIdErrorText } from "@/features/auth/error-text";
import { PageFrame } from "@/features/org-admin/parts";
import { useBusiness } from "@/lib/session";
import { useInbox, useMarkNotificationRead } from "./queries";

/** Own private inbox (90 days). Texts are plain, localized when the event happened. */
export function InboxScreen() {
  const t = useTranslations("account.inbox");
  const router = useRouter();
  const errorText = useIdErrorText();
  const { organization } = useBusiness();
  const side = organization.type === "VENDOR" ? "vendor" : "buyer";
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const inbox = useInbox(filter === "unread" ? true : null);
  const mark = useMarkNotificationRead();
  const items = inbox.data?.pages.flatMap((p) => p.items) ?? [];

  const open = (n: Notification) => {
    if (!n.read) mark.mutate(n, { onError: (e) => toast.error(errorText(e)) });
    if (n.orderId) router.push(`/${side}/orders/${n.orderId}`);
  };

  return (
    <PageFrame
      title={t("title")}
      subtitle={t("description")}
      action={
        <ToggleGroup type="single" variant="outline" value={filter} onValueChange={(v) => v && setFilter(v as "all" | "unread")} aria-label={t("filter")}>
          <ToggleGroupItem value="all">{t("all")}</ToggleGroupItem>
          <ToggleGroupItem value="unread">{t("unread")}</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      {inbox.isError ? (
        <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />
      ) : inbox.isPending ? (
        <RowsSkeleton rows={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={BellIcon} title={filter === "unread" ? t("emptyUnread") : t("empty")} />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <ul className="flex flex-col divide-y">
              {items.map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={n.read ? "mt-1.5 size-2 shrink-0" : "mt-1.5 size-2 shrink-0 rounded-full bg-primary"} aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className={n.read ? "text-sm whitespace-pre-line" : "text-sm font-medium whitespace-pre-line"}>{n.text}</p>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {formatDateTime(n.createdAt)}
                      {!n.read && <Badge variant="secondary">{t("unreadLabel")}</Badge>}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {n.orderId && (
                      <Button variant="outline" size="sm" onClick={() => open(n)}>
                        {t("openOrder")}
                      </Button>
                    )}
                    {!n.read && (
                      <Button variant="ghost" size="icon-sm" aria-label={t("markRead")} disabled={mark.isPending && mark.variables?.id === n.id} onClick={() => mark.mutate(n)}>
                        <CheckIcon />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {inbox.hasNextPage && (
        <Button variant="outline" className="self-center" disabled={inbox.isFetchingNextPage} onClick={() => void inbox.fetchNextPage()}>
          {inbox.isFetchingNextPage && <Spinner data-icon="inline-start" />}
          {t("loadMore")}
        </Button>
      )}
    </PageFrame>
  );
}
