import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { formatDate, formatDateTime, isApiError, isOrgAdmin, type Relationship, type RelationshipState } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useT } from '@/lib/i18n';
import { sessionStore, useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { DisconnectPanel, PartnerDetails, RelationshipStateBadge, usePartnerName } from './parts';
import { useBuyerInvitations, usePartner, useRelationship, useRelationshipPages } from './queries';

/** Buyer → Vendors (stack screen): current and former suppliers, incoming invitations. */
export function BuyerVendorsScreen() {
  const c = useTokenColors();
  const t = useT('trdVendors');
  const session = useBusiness();
  const admin = isOrgAdmin(session);
  const [view, setView] = useState<RelationshipState>('ACTIVE');
  const list = useRelationshipPages(view);
  const invitations = useBuyerInvitations('PENDING', admin);
  const incoming = (invitations.data ?? []).filter((i) => i.purpose === 'TRADING');

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  return (
    <FlatList<Relationship>
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      data={list.data?.pages.flatMap((p) => p.items) ?? []}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={
        <View className="gap-3 p-4">
          <Stack.Screen options={{ title: t('title') }} />
          {incoming.length > 0 && (
            <View accessibilityRole="alert" className="gap-1 rounded-lg border border-border bg-card p-3">
              <AppText weight="medium" className="text-sm text-foreground">
                {t('incoming.title', { count: incoming.length })}
              </AppText>
              {incoming.map((i) => (
                <AppText key={i.id} className="text-sm text-muted-foreground">
                  {t('incoming.item', { email: i.recipientEmail, date: formatDateTime(i.expiresAt) })}
                </AppText>
              ))}
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            <Chip role="radio" label={t('tabs.active')} selected={view === 'ACTIVE'} onPress={() => setView('ACTIVE')} />
            <Chip role="radio" label={t('tabs.disconnected')} selected={view === 'DISCONNECTED'} onPress={() => setView('DISCONNECTED')} />
          </ScrollView>
        </View>
      }
      renderItem={({ item }) => <VendorRow relationship={item} current={session.activeVendorId === item.vendorId} />}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
      ListEmptyComponent={
        list.isPending ? (
          <LoadingState />
        ) : view === 'ACTIVE' ? (
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : (
          <EmptyState title={t('emptyDisconnectedTitle')} description={t('emptyDisconnectedDescription')} />
        )
      }
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}

function VendorRow({ relationship: r, current }: { relationship: Relationship; current: boolean }) {
  const t = useT('trdVendors');
  const name = usePartnerName(r.vendorId);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={name}
      onPress={() => router.push({ pathname: '/buyer/vendor/[id]', params: { id: r.id } })}
      className="gap-1 px-4 py-3 active:bg-muted">
      <View className="flex-row items-center justify-between gap-3">
        <AppText weight="medium" className="flex-1 text-base text-foreground" numberOfLines={1}>
          {name ?? '…'}
        </AppText>
        {current ? <Badge variant="brand">{t('current')}</Badge> : <RelationshipStateBadge state={r.state} />}
      </View>
      <AppText className="text-sm text-muted-foreground">
        {r.state === 'ACTIVE' ? t('since', { date: formatDate(r.createdAt) }) : t('disconnectedSince', { date: formatDate(r.updatedAt) })}
      </AppText>
    </Pressable>
  );
}

/** Buyer → one vendor relationship on mobile. */
export function BuyerVendorDetailScreen({ relationshipId }: { relationshipId: string }) {
  const t = useT('trdVendors.detail');
  const session = useBusiness();
  const relationship = useRelationship(relationshipId);
  const partner = usePartner(relationship.data?.vendorId);

  if (relationship.isError) {
    return isApiError(relationship.error, 'NOT_FOUND') ? (
      <EmptyState title={t('notFoundTitle')} description={t('notFoundDescription')} />
    ) : (
      <ErrorState error={relationship.error} onRetry={() => void relationship.refetch()} />
    );
  }
  if (relationship.isPending) return <LoadingState />;
  const r = relationship.data;
  const name = partner.data?.displayName ?? t('formerVendor');
  const active = r.state === 'ACTIVE';

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-12" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: partner.data?.displayName ?? '' }} />
      <View className="gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <AppText weight="semibold" className="text-xl text-foreground">
            {partner.isPending ? ' ' : name}
          </AppText>
          <RelationshipStateBadge state={r.state} />
        </View>
        <AppText className="text-sm text-muted-foreground">
          {active ? t('since', { date: formatDate(r.createdAt) }) : t('disconnectedOn', { date: formatDate(r.updatedAt) })}
        </AppText>
      </View>

      {!active && (
        <View className="gap-1 rounded-lg border border-border bg-card p-3">
          <AppText weight="medium" className="text-sm text-foreground">
            {t('disconnectedTitle')}
          </AppText>
          {r.disconnectedReason && <AppText className="text-sm text-muted-foreground">{t('reason', { reason: r.disconnectedReason })}</AppText>}
          <AppText className="text-sm text-muted-foreground">{t('disconnectedNote')}</AppText>
        </View>
      )}
      {active && r.agreedPriceConfirmationRequired && (
        <View className="gap-1 rounded-lg border border-border bg-card p-3">
          <AppText weight="medium" className="text-sm text-foreground">
            {t('pricesReviewTitle')}
          </AppText>
          <AppText className="text-sm text-muted-foreground">{t('pricesReviewDescription', { name })}</AppText>
        </View>
      )}

      {active && (
        <Button onPress={() => void sessionStore.selectVendor(r.vendorId).then(() => router.push('/buyer'))}>{t('browse')}</Button>
      )}
      <Button variant="outline" onPress={() => router.push({ pathname: '/buyer/orders', params: { partnerId: r.vendorId } })}>
        {t('orders')}
      </Button>

      {partner.data ? (
        <PartnerDetails partner={partner.data} />
      ) : partner.isError ? (
        <AppText className="text-sm text-muted-foreground">{t('noPartnerDetails')}</AppText>
      ) : null}

      {isOrgAdmin(session) && active && (
        <DisconnectPanel
          relationship={r}
          partnerName={name}
          onDisconnected={(updated) => {
            if (session.activeVendorId === updated.vendorId) void sessionStore.selectVendor(null);
          }}
        />
      )}
    </ScrollView>
  );
}
