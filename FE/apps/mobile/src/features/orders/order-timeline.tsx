import { useEffect } from 'react';
import { View } from 'react-native';
import { formatDateTime, orderEventKind, pageItems, type Order } from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Card, CardHeader } from '@/components/ui/card';
import { useT } from '@/lib/i18n';
import { useOrderEvents } from './queries';

/** Actual immutable order history, oldest first; own-organization actors by name (mirrors web). */
export function OrderTimeline({ order, ownOrganizationId }: { order: Order; ownOrganizationId: string }) {
  const t = useT('orders.timeline');
  const events = useOrderEvents(order.id);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = events;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const items = pageItems(events.data?.pages);

  return (
    <Card>
      <CardHeader title={t('title')} />
      {events.isError ? (
        <ErrorState error={events.error} onRetry={() => void events.refetch()} />
      ) : events.isPending ? (
        <LoadingState />
      ) : (
        <View>
          {items.map((e, i) => {
            const kind = orderEventKind(e);
            const orgName = e.actorOrganizationId === order.vendor.organizationId ? order.vendor.displayName : order.buyer.displayName;
            const actor =
              e.actorOrganizationId === ownOrganizationId && e.ownActorDisplayName
                ? t('byPerson', { name: e.ownActorDisplayName, organization: orgName })
                : orgName;
            const title =
              kind === 'STAGE_SET'
                ? t('STAGE_SET', { stage: e.stageName ?? '—' })
                : kind === 'STAGE_CLEARED'
                  ? t('STAGE_CLEARED', { stage: e.previousStageName ?? '—' })
                  : t(kind);
            return (
              <View key={e.id} className="flex-row gap-3">
                <View className="items-center">
                  <View className={`mt-1.5 size-2.5 rounded-full ${i === items.length - 1 ? 'bg-success' : 'bg-border'}`} />
                  {i < items.length - 1 && <View className="w-px flex-1 bg-border" />}
                </View>
                <View className="flex-1 gap-0.5 pb-4">
                  <AppText weight="medium" className="text-sm text-foreground">
                    {title}
                  </AppText>
                  <AppText className="text-xs text-muted-foreground">{`${formatDateTime(e.createdAt)} · ${actor}`}</AppText>
                  {e.reason ? <AppText className="text-sm text-muted-foreground">{t('reason', { reason: e.reason })}</AppText> : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}
