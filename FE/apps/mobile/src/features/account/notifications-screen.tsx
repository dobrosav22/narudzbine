import { Alert, View } from 'react-native';
import { formatDateTime, isApiError, NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, togglePreference, type Event, type NotificationChannel } from '@repo/core';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { SwitchRow } from '@/components/ui/switch-row';
import { useIdErrorText } from '@/features/auth/error-text';
import { IdFormError } from '@/features/auth/form-error';
import { useT } from '@/lib/i18n';
import { useDevices, useNotificationPreferences, useRemoveDevice, useUpdateNotificationPreferences } from './queries';

/**
 * Per-event channel switches and registered push devices. Registering this phone for push
 * needs a real FCM/APNs token (expo-notifications and the provider project are not set up):
 * see docs/frontend/area-notes/identity-organization.md.
 */
export function NotificationsScreen() {
  const t = useT();
  const errorText = useIdErrorText();
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const devices = useDevices();
  const remove = useRemoveDevice();

  if (prefs.isPending) return <LoadingState />;
  const toggle = (event: Event, channel: NotificationChannel, enabled: boolean) => {
    if (!prefs.data) return;
    update.mutate(
      { expectedRevision: prefs.data.revision, events: togglePreference(prefs.data, event, channel, enabled) },
      {
        onError: (e) => {
          if (isApiError(e, 'REVISION_CONFLICT')) void prefs.refetch();
          Alert.alert(t('account.notifications.saveFailed'), errorText(e));
        },
      },
    );
  };

  return (
    <FormScreen>
      <Card>
        <CardHeader title={t('account.notifications.title')} description={t('account.notifications.description')} />
        <IdFormError error={prefs.error} />
        {prefs.data &&
          NOTIFICATION_EVENTS.map((event) => {
            const pref = prefs.data.events.find((p) => p.event === event);
            return (
              <View key={event} className="gap-2 border-t border-border pt-3">
                <AppText weight="medium" className="text-sm text-foreground">
                  {t(`notificationTypes.${event}.label`)}
                </AppText>
                <AppText className="text-xs text-muted-foreground">{t(`notificationTypes.${event}.description`)}</AppText>
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <SwitchRow
                    key={channel}
                    label={t(`channels.${channel}`)}
                    accessibilityLabel={t('account.notifications.switchAria', { event: t(`notificationTypes.${event}.label`), channel: t(`channels.${channel}`) })}
                    value={pref ? pref[channel] : channel === 'inApp'}
                    disabled={update.isPending}
                    onValueChange={(v) => toggle(event, channel, v)}
                  />
                ))}
              </View>
            );
          })}
        <AppText className="text-xs text-muted-foreground">{t('account.notifications.deliveryNote')}</AppText>
      </Card>

      <Card>
        <CardHeader title={t('account.devices.title')} description={t('account.devices.description')} />
        <IdFormError error={devices.error} />
        {devices.data?.items.length === 0 && <AppText className="text-sm text-muted-foreground">{t('account.devices.none')}</AppText>}
        {devices.data?.items.map((d) => (
          <View key={d.id} className="flex-row items-center gap-3 border-t border-border pt-3">
            <View className="flex-1 gap-1">
              <View className="flex-row items-center gap-2">
                <AppText weight="medium" className="text-sm text-foreground">
                  {t(`account.devices.platforms.${d.platform}`)}
                </AppText>
                <Badge variant={d.enabled ? 'success' : 'outline'}>{d.enabled ? t('account.devices.enabled') : t('account.devices.disabled')}</Badge>
              </View>
              <AppText className="text-xs text-muted-foreground">{t('account.devices.registered', { date: formatDateTime(d.createdAt) })}</AppText>
            </View>
            {d.enabled && (
              <Button variant="ghost" size="sm" onPress={() => remove.mutate(d.id, { onError: (e) => Alert.alert(errorText(e)) })}>
                {t('account.devices.remove')}
              </Button>
            )}
          </View>
        ))}
        <AppText className="text-xs text-muted-foreground">{t('account.devices.mobileUnavailable')}</AppText>
      </Card>
    </FormScreen>
  );
}
