import { ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { formatDate, formatMoney, isApiError, isOrgAdmin, type Currency, type Relationship } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import { DisconnectPanel, PartnerDetails, RelationshipStateBadge } from './parts';
import { useAgreedPrices, useConfirmAgreedPrices, useOwnProductNames, usePartner, useRelationship } from './queries';
import { InviteForm } from './vendor-buyers-screen';

/** Vendor → one buyer relationship on mobile. */
export function VendorBuyerDetailScreen({ relationshipId }: { relationshipId: string }) {
  const t = useT('vendorBuyers.detail');
  const session = useBusiness();
  const admin = isOrgAdmin(session);
  const relationship = useRelationship(relationshipId);
  const partner = usePartner(relationship.data?.buyerId);

  if (relationship.isError) {
    return isApiError(relationship.error, 'NOT_FOUND') ? (
      <EmptyState title={t('notFoundTitle')} description={t('notFoundDescription')} />
    ) : (
      <ErrorState error={relationship.error} onRetry={() => void relationship.refetch()} />
    );
  }
  if (relationship.isPending) return <LoadingState />;
  const r = relationship.data;
  const name = partner.data?.displayName ?? t('formerBuyer');
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
        {!active && r.disconnectedReason && <AppText className="text-sm text-foreground">{t('reason', { reason: r.disconnectedReason })}</AppText>}
      </View>

      <Button variant="outline" onPress={() => router.push({ pathname: '/vendor/orders', params: { partnerId: r.buyerId } })}>
        {t('orders')}
      </Button>

      {partner.data ? (
        <PartnerDetails partner={partner.data} />
      ) : partner.isError ? (
        <AppText className="text-sm text-muted-foreground">{t('noPartnerDetails')}</AppText>
      ) : null}

      {!active && admin && (
        <Card>
          <CardHeader title={t('reconnectTitle')} description={t('reconnectDescription', { name })} />
          <InviteForm buyerOrganizationId={r.buyerId} />
        </Card>
      )}

      <AgreedPrices relationship={r} currency={session.organization.currency} partnerName={name} />

      {admin && active && <DisconnectPanel relationship={r} partnerName={name} />}
    </ScrollView>
  );
}

/** Agreed prices (read-only) and, after a reconnection, confirming every dormant one. */
function AgreedPrices({ relationship, currency, partnerName }: { relationship: Relationship; currency: Currency; partnerName: string }) {
  const t = useT('vendorBuyers.agreed');
  const prices = useAgreedPrices(relationship.id);
  const items = prices.data?.items ?? [];
  const names = useOwnProductNames(items.map((p) => p.productId));
  const confirm = useConfirmAgreedPrices();
  const pending = items.filter((p) => p.confirmationRequired).map((p) => p.productId);
  const reviewing = relationship.state === 'ACTIVE' && relationship.agreedPriceConfirmationRequired;

  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      {prices.isError ? (
        <FormError error={prices.error} />
      ) : prices.isPending ? (
        <AppText className="text-sm text-muted-foreground">…</AppText>
      ) : (
        <>
          {reviewing && (
            <View className="gap-2 rounded-lg border border-border p-3">
              <AppText weight="medium" className="text-sm text-foreground">
                {t('reviewTitle')}
              </AppText>
              <AppText className="text-sm text-muted-foreground">
                {items.length ? t('reviewDescription', { name: partnerName }) : t('reviewEmpty', { name: partnerName })}
              </AppText>
              <FormError error={confirm.error} />
              <Button
                size="sm"
                className="self-start"
                loading={confirm.isPending}
                onPress={() =>
                  prices.data &&
                  confirm.mutate(
                    {
                      relationshipId: relationship.id,
                      expectedRelationshipRevision: prices.data.relationshipRevision,
                      expectedPricingRevision: prices.data.pricingRevision,
                      productIds: pending,
                    },
                    { onError: (e) => isApiError(e, 'REVISION_CONFLICT') && void prices.refetch() },
                  )
                }>
                {items.length ? t('confirmSelected', { count: pending.length }) : t('confirmEmpty')}
              </Button>
            </View>
          )}
          {items.length === 0 ? (
            <AppText className="text-sm text-muted-foreground">{t('empty', { name: partnerName })}</AppText>
          ) : (
            items.map((p) => (
              <View key={p.id} className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <AppText className="text-sm text-foreground" numberOfLines={2}>
                    {names.get(p.productId)?.name ?? '—'}
                  </AppText>
                  {p.confirmationRequired && <Badge variant="warning">{t('dormant')}</Badge>}
                </View>
                <AppText mono className="text-sm text-foreground">
                  {formatMoney(p.unitPrice, currency)}
                </AppText>
              </View>
            ))
          )}
          <AppText className="text-xs text-muted-foreground">{t('netNote')}</AppText>
        </>
      )}
    </Card>
  );
}
