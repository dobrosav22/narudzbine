import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import {
  dashboardQueries,
  formatDate,
  formatMoney,
  formatNumber,
  inventoryQueries,
  localToday,
  orderStateTone,
  presetReportRange,
  reportHasActivity,
  usageMsg,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { PeriodBars, SectionTitle, StatTile } from '@/features/stats/parts';
import { useReportSummary } from '@/features/stats/queries';
import { useVendorPlan } from '@/features/subscription/queries';
import { useMsg, useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';

/** Vendor home on mobile — mirrors web: last 30 days, waiting orders, plan, inventory, promotions, recent orders. */
export function DashboardScreen() {
  const c = useTokenColors();
  const t = useT('dashboard');
  const tmo = useT('mDashboard');
  const ts = useT('ordState');
  const tm = useMsg();
  const { organization } = useBusiness();
  const currency = organization.currency;
  const summary = useReportSummary(presetReportRange('30d', localToday()));
  const awaiting = useQuery(dashboardQueries.awaitingAcceptance());
  const orders = useQuery(dashboardQueries.recentOrders(5));
  const plan = useVendorPlan();
  const tracking = useQuery(inventoryQueries.tracking());
  const promotions = useQuery(dashboardQueries.runningPromotions());

  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  if (summary.isPending) return <LoadingState label={tmo('loading')} />;
  const s = summary.data;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={summary.isRefetching}
          onRefresh={() => void Promise.all([summary.refetch(), awaiting.refetch(), orders.refetch(), plan.refetch(), tracking.refetch(), promotions.refetch()])}
          tintColor={c.primary}
          colors={[c.primary]}
        />
      }>
      <View className="flex-row flex-wrap gap-3">
        <StatTile label={tmo('sales30')} value={formatMoney(s.goodsTotal, currency)} />
        <StatTile label={tmo('orders30')} value={formatNumber(s.orderCount)} />
        <StatTile label={t('awaiting')} value={awaiting.data ? `${formatNumber(awaiting.data.count)}${awaiting.data.more ? '+' : ''}` : '—'} />
        <StatTile label={t('activeBuyers')} value={formatNumber(s.activeBuyerCount ?? 0)} />
      </View>
      <AppText className="-mt-3 text-xs text-muted-foreground">{t('deliveredNote')}</AppText>

      <View className="gap-3">
        <SectionTitle action={<LinkButton label={t('stats')} onPress={() => router.push('/vendor/stats')} />}>{t('salesByDay')}</SectionTitle>
        <View className="rounded-xl border border-border bg-card p-4">
          {reportHasActivity(s.buckets) ? (
            <PeriodBars buckets={s.buckets} grouping={s.grouping} currency={currency} label={t('sales')} />
          ) : (
            <AppText className="text-sm text-muted-foreground">{t('noSales')}</AppText>
          )}
        </View>
      </View>

      <View className="gap-3">
        <SectionTitle action={<LinkButton label={t('manage')} onPress={() => router.push('/vendor/plan')} />}>{t('plan')}</SectionTitle>
        <View className="gap-1 rounded-xl border border-border bg-card p-4">
          {plan.data ? (
            <>
              <AppText className="text-sm text-foreground">{tm(usageMsg(plan.data, 'products'))}</AppText>
              <AppText className="text-sm text-foreground">{tm(usageMsg(plan.data, 'buyers'))}</AppText>
            </>
          ) : (
            <AppText className="text-sm text-muted-foreground">{plan.isError ? t('unavailable') : '…'}</AppText>
          )}
        </View>
      </View>

      <View className="gap-3">
        <SectionTitle action={<LinkButton label={t('manage')} onPress={() => router.push('/vendor/inventory' as Href)} />}>{t('inventory')}</SectionTitle>
        <AppText className="text-sm text-muted-foreground">
          {tracking.data ? (tracking.data.enabled ? t('trackingOn') : t('trackingOff')) : tracking.isError ? t('unavailable') : '…'}
        </AppText>
      </View>

      <View className="gap-3">
        <SectionTitle action={<LinkButton label={t('manage')} onPress={() => router.push('/vendor/merchandising')} />}>{t('promotions')}</SectionTitle>
        <AppText className="text-sm text-muted-foreground">
          {promotions.data !== undefined
            ? t('running', { count: promotions.data, countText: formatNumber(promotions.data) })
            : promotions.isError
              ? t('unavailable')
              : '…'}
        </AppText>
      </View>

      <View className="gap-3">
        <SectionTitle action={<LinkButton label={t('allOrders')} onPress={() => router.push('/vendor/orders')} />}>{t('recentOrders')}</SectionTitle>
        <View className="overflow-hidden rounded-xl border border-border">
          {orders.isError ? (
            <AppText className="p-4 text-sm text-destructive">{t('unavailable')}</AppText>
          ) : !orders.data ? (
            <AppText className="p-4 text-sm text-muted-foreground">…</AppText>
          ) : orders.data.length === 0 ? (
            <AppText className="p-4 text-sm text-muted-foreground">{tmo('noOrders')}</AppText>
          ) : (
            orders.data.map((o, i) => (
              <View key={o.id}>
                {i > 0 && <View className="h-px bg-border" />}
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={tmo('orderAria', { number: o.number })}
                  onPress={() => router.push({ pathname: '/vendor/order/[id]', params: { id: o.id } })}
                  className="gap-1 bg-background p-3 active:bg-muted">
                  <View className="flex-row items-center justify-between gap-3">
                    <AppText mono weight="semibold" className="text-base text-foreground">
                      {o.number}
                    </AppText>
                    <Badge variant={orderStateTone(o.state)}>
                      {o.state === 'ACCEPTED' && o.stageName ? ts('withStage', { state: ts(o.state), stage: o.stageName }) : ts(o.state)}
                    </Badge>
                  </View>
                  <View className="flex-row justify-between gap-3">
                    <AppText className="flex-1 text-sm text-muted-foreground" numberOfLines={1}>
                      {`${o.buyer.displayName} · ${formatDate(o.submittedAt)}`}
                    </AppText>
                    <AppText mono className="text-sm text-foreground">
                      {formatMoney(o.goodsTotal, o.currency)}
                    </AppText>
                  </View>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useTokenColors();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} className="flex-row items-center gap-0.5">
      <AppText weight="medium" className="text-sm text-primary">
        {label}
      </AppText>
      <ChevronRight size={16} color={c.primary} />
    </Pressable>
  );
}
