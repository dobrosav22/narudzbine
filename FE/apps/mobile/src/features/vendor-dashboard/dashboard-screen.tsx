import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import {
  countMsg,
  describeDiscount,
  describeScope,
  formatDate,
  formatMoney,
  formatNumber,
  hasActivity,
  orderNumber,
  orderTotal,
  promotionState,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { usePromotions } from '@/features/merchandising/queries';
import { StatusBadge } from '@/features/orders/status-badge';
import { MonthBars, SectionTitle, StatTile } from '@/features/stats/parts';
import { useVendorSummary } from '@/features/stats/queries';
import { useCategories, useVendorOrg } from '@/features/vendor-catalogue/queries';
import { useVendorOrderContext } from '@/features/vendor-orders/queries';
import { useTokenColors } from '@/theme';
import { useMsg, useT } from '@/lib/i18n';

/** 03 → vendor "Dashboard" on mobile: headline numbers, revenue trend, low stock (if tracked), promotions, recent orders. */
export function DashboardScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const c = useTokenColors();
  const t = useT('dashboard');
  const tmo = useT('m.dashboard');
  const tmc = useT('m.common');
  const tm = useMsg();
  const summary = useVendorSummary(vendorOrgId);
  const context = useVendorOrderContext(vendorOrgId);
  const org = useVendorOrg(vendorOrgId);
  const promotions = usePromotions(vendorOrgId);
  const categories = useCategories(vendorOrgId);

  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  if (summary.isPending) return <LoadingState label={tmo('loading')} />;
  const s = summary.data;
  const live = (promotions.data ?? []).filter((p) => promotionState(p) === 'live');
  const names = new Map<string, string>([
    ...(categories.data ?? []).map((x) => [x.id, x.name] as const),
    ...[...(context.data?.products.values() ?? [])].map((p) => [p.id, p.name] as const),
    ...[...(context.data?.buyers.values() ?? [])].map((b) => [b.id, b.name] as const),
  ]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={summary.isRefetching}
          onRefresh={() => void Promise.all([summary.refetch(), promotions.refetch()])}
          tintColor={c.primary}
          colors={[c.primary]}
        />
      }>
      <View className="flex-row flex-wrap gap-3">
        <StatTile label={tmo('revenue30')} value={formatMoney(s.revenueLast30d)} />
        <StatTile label={tmo('orders30')} value={formatNumber(s.ordersLast30d)} />
        <StatTile label={t('openOrders')} value={formatNumber(s.openOrders)} />
        <StatTile label={t('activeBuyers')} value={formatNumber(s.activeBuyers)} />
      </View>

      <View className="gap-3">
        <SectionTitle action={<LinkButton label={t('stats')} onPress={() => router.push('/vendor/stats')} />}>{t('revenueByMonth')}</SectionTitle>
        <View className="rounded-xl border border-border bg-card p-4">
          {hasActivity(s.revenueByMonth) ? (
            <MonthBars buckets={s.revenueByMonth} label={t('revenue')} />
          ) : (
            <AppText className="text-sm text-muted-foreground">{t('noRevenue')}</AppText>
          )}
        </View>
      </View>

      {org.data?.tracksInventory && (
        <View className="gap-3">
          <SectionTitle>{t('lowStock')}</SectionTitle>
          <View className="overflow-hidden rounded-xl border border-border">
            {s.lowStockProducts.length === 0 ? (
              <AppText className="p-4 text-sm text-muted-foreground">{tmo('allStocked')}</AppText>
            ) : (
              s.lowStockProducts.slice(0, 6).map((p, i) => (
                <View key={p.id}>
                  {i > 0 && <View className="h-px bg-border" />}
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push({ pathname: '/vendor/product/[id]', params: { id: p.id } })}
                    className="flex-row items-center justify-between gap-3 bg-background p-3 active:bg-muted">
                    <AppText className="flex-1 text-sm text-foreground" numberOfLines={1}>
                      {p.name}
                    </AppText>
                    <Badge variant={p.stock === 0 ? 'destructive' : 'warning'}>
                      {p.stock === 0 ? t('outOfStock') : t('left', { count: formatNumber(p.stock ?? 0) })}
                    </Badge>
                  </Pressable>
                </View>
              ))
            )}
          </View>
          {s.lowStockProducts.length > 6 && (
            <AppText className="text-sm text-muted-foreground">
              {tm(countMsg('m.dashboard.more', s.lowStockProducts.length - 6))}
            </AppText>
          )}
        </View>
      )}

      <View className="gap-3">
        <SectionTitle action={<LinkButton label={tmo('merchandising')} onPress={() => router.push('/vendor/merchandising')} />}>
          {t('promotions')}
        </SectionTitle>
        <View className="overflow-hidden rounded-xl border border-border">
          {promotions.isError ? (
            <AppText className="p-4 text-sm text-destructive">{tmo('promotionsFailed')}</AppText>
          ) : live.length === 0 ? (
            <AppText className="p-4 text-sm text-muted-foreground">
              {promotions.isPending ? tmc('loading') : t('noLive')}
            </AppText>
          ) : (
            live.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <View className="h-px bg-border" />}
                <View className="flex-row items-center justify-between gap-3 bg-background p-3">
                  <AppText className="flex-1 text-sm text-foreground" numberOfLines={1}>
                    {tm(describeScope(p, names))}
                  </AppText>
                  <Badge variant="success">{tm(describeDiscount(p))}</Badge>
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      <View className="gap-3">
        <SectionTitle action={<LinkButton label={t('allOrders')} onPress={() => router.push('/vendor/orders')} />}>{t('recentOrders')}</SectionTitle>
        <View className="overflow-hidden rounded-xl border border-border">
          {s.recentOrders.length === 0 ? (
            <AppText className="p-4 text-sm text-muted-foreground">{tmo('noOrders')}</AppText>
          ) : (
            s.recentOrders.map((o, i) => (
              <View key={o.id}>
                {i > 0 && <View className="h-px bg-border" />}
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={tmo('orderAria', { number: orderNumber(o) })}
                  onPress={() => router.push({ pathname: '/vendor/order/[id]', params: { id: o.id } })}
                  className="gap-1 bg-background p-3 active:bg-muted">
                  <View className="flex-row items-center justify-between gap-3">
                    <AppText mono weight="semibold" className="text-base text-foreground">
                      {orderNumber(o)}
                    </AppText>
                    <StatusBadge config={context.data?.config} statusKey={o.statusKey} />
                  </View>
                  <View className="flex-row justify-between gap-3">
                    <AppText className="flex-1 text-sm text-muted-foreground" numberOfLines={1}>
                      {`${context.data?.buyers.get(o.buyerOrgId)?.name ?? '…'} · ${formatDate(o.createdAt)}`}
                    </AppText>
                    <AppText mono className="text-sm text-foreground">
                      {formatMoney(orderTotal(o))}
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
