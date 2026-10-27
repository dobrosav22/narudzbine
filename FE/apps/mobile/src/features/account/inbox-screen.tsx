import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { formatDateTime, type Notification } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import { useInbox, useMarkNotificationRead } from './queries';

/** Own private inbox (90 days). Tapping an order notice marks it read and opens the order. */
export function InboxScreen() {
  const t = useT('account.inbox');
  const { organization } = useBusiness();
  const side = organization.type === 'VENDOR' ? 'vendor' : 'buyer';
  const [unreadOnly, setUnreadOnly] = useState(false);
  const inbox = useInbox(unreadOnly ? true : null);
  const mark = useMarkNotificationRead();
  const items = inbox.data?.pages.flatMap((p) => p.items) ?? [];

  const open = (n: Notification) => {
    if (!n.read) mark.mutate(n);
    if (n.orderId) router.push(`/${side}/order/${n.orderId}`);
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row gap-2 p-4 pb-2">
        <Chip role="radio" label={t('all')} selected={!unreadOnly} onPress={() => setUnreadOnly(false)} />
        <Chip role="radio" label={t('unread')} selected={unreadOnly} onPress={() => setUnreadOnly(true)} />
      </View>
      {inbox.isError ? (
        <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />
      ) : inbox.isPending ? (
        <LoadingState />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          onRefresh={() => void inbox.refetch()}
          refreshing={inbox.isRefetching}
          ListEmptyComponent={<EmptyState title={unreadOnly ? t('emptyUnread') : t('empty')} />}
          ItemSeparatorComponent={() => <View className="h-px bg-border" />}
          renderItem={({ item: n }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityHint={n.orderId ? t('openOrder') : t('markRead')}
              onPress={() => open(n)}
              className="flex-row items-start gap-3 bg-background px-4 py-3 active:bg-muted">
              <View className={`mt-1.5 size-2 rounded-full ${n.read ? 'bg-transparent' : 'bg-primary'}`} />
              <View className="flex-1 gap-1">
                <AppText weight={n.read ? 'regular' : 'medium'} className="text-sm text-foreground">
                  {n.text}
                </AppText>
                <AppText className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</AppText>
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            inbox.hasNextPage ? (
              <View className="p-4">
                <Button variant="outline" loading={inbox.isFetchingNextPage} onPress={() => void inbox.fetchNextPage()}>
                  {t('loadMore')}
                </Button>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
