"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatDateTime, isApiError, NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, togglePreference, type Event, type NotificationChannel } from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { useIdErrorText } from "@/features/auth/error-text";
import { useDevices, useNotificationPreferences, useRemoveDevice, useUpdateNotificationPreferences } from "./queries";

/** Per-event channel switches and the push-device list. */
export function NotificationsPanel() {
  return (
    <div className="flex flex-col gap-4">
      <PreferencesCard />
      <DevicesCard />
    </div>
  );
}

function PreferencesCard() {
  const t = useTranslations();
  const errorText = useIdErrorText();
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();

  const toggle = (event: Event, channel: NotificationChannel, enabled: boolean) => {
    if (!prefs.data) return;
    update.mutate(
      { expectedRevision: prefs.data.revision, events: togglePreference(prefs.data, event, channel, enabled) },
      {
        onError: (e) => {
          // A stale revision means another device changed them: show the current values.
          if (isApiError(e, "REVISION_CONFLICT")) void prefs.refetch();
          toast.error(`${t("account.notifications.saveFailed")}: ${errorText(e)}`);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("account.notifications.title")}</CardTitle>
        <CardDescription>{t("account.notifications.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {prefs.isError ? (
          <ErrorState error={prefs.error} onRetry={() => void prefs.refetch()} />
        ) : prefs.isPending ? (
          <RowsSkeleton rows={6} />
        ) : (
          <Table aria-label={t("account.notifications.tableAria")} className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t("account.notifications.event")}</TableHead>
                {NOTIFICATION_CHANNELS.map((c) => (
                  <TableHead key={c} className="w-20 text-center">
                    {t(`channels.${c}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {NOTIFICATION_EVENTS.map((event) => {
                const pref = prefs.data.events.find((p) => p.event === event);
                return (
                  <TableRow key={event}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{t(`notificationTypes.${event}.label`)}</span>
                        <span className="text-xs text-muted-foreground">{t(`notificationTypes.${event}.description`)}</span>
                      </div>
                    </TableCell>
                    {NOTIFICATION_CHANNELS.map((channel) => (
                      <TableCell key={channel} className="text-center">
                        <Switch
                          checked={pref ? pref[channel] : channel === "inApp"}
                          disabled={update.isPending}
                          onCheckedChange={(v) => toggle(event, channel, v)}
                          aria-label={t("account.notifications.switchAria", {
                            event: t(`notificationTypes.${event}.label`),
                            channel: t(`channels.${channel}`),
                          })}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">{t("account.notifications.deliveryNote")}</p>
      </CardContent>
    </Card>
  );
}

function DevicesCard() {
  const t = useTranslations("account.devices");
  const errorText = useIdErrorText();
  const devices = useDevices();
  const remove = useRemoveDevice();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {devices.isError ? (
          <ErrorState error={devices.error} onRetry={() => void devices.refetch()} />
        ) : devices.isPending ? (
          <RowsSkeleton rows={1} />
        ) : devices.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {devices.data.items.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    {t(`platforms.${d.platform}`)}
                    <Badge variant={d.enabled ? "secondary" : "outline"}>{d.enabled ? t("enabled") : t("disabled")}</Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">{t("registered", { date: formatDateTime(d.createdAt) })}</span>
                </div>
                {d.enabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending && remove.variables === d.id}
                    onClick={() => remove.mutate(d.id, { onSuccess: () => toast.success(t("removed")), onError: (e) => toast.error(errorText(e)) })}
                  >
                    {t("remove")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t("webUnavailable")}</p>
      </CardContent>
    </Card>
  );
}
