import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { formatDateTime, formatNumber, isApiError, parseQuantityInput, QUANTITY_MAX, type ReconciliationLine } from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { useT } from '@/lib/i18n';
import { CatalogueFormError, StockStatusBadge, useCatalogueErrorText } from './parts';
import {
  useInfiniteProducts,
  useInventoryMutations,
  useProductsById,
  useReconciliation,
  useReconciliationLines,
  useStockEvents,
  useStocks,
  useTracking,
} from './queries';

/** Mobile inventory: tracking mode, the review that enables tracking, counts per product and history. */
export function InventoryScreen() {
  const [reviewId, setReviewId] = useState<string | null>(null);
  return (
    <ScrollView className="flex-1 bg-background" keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-12">
      <TrackingCard reviewing={!!reviewId} onStartReview={setReviewId} />
      {reviewId && <ReviewCard previewId={reviewId} onLeave={() => setReviewId(null)} />}
      <StockList />
      <Events />
    </ScrollView>
  );
}

function TrackingCard({ reviewing, onStartReview }: { reviewing: boolean; onStartReview: (id: string) => void }) {
  const t = useT('invInventory.tracking');
  const tc = useT('common');
  const errorText = useCatalogueErrorText();
  const tracking = useTracking();
  const m = useInventoryMutations();
  if (tracking.isError) return <ErrorState error={tracking.error} onRetry={() => void tracking.refetch()} />;
  if (!tracking.data) return <LoadingState />;
  const on = tracking.data.enabled;
  const disable = () =>
    Alert.alert(t('disableTitle'), t('disableDescription'), [
      { text: tc('cancel'), style: 'cancel' },
      { text: t('disable'), style: 'destructive', onPress: () => m.disable.mutate(tracking.data!.revision, { onError: (e) => Alert.alert(errorText(e)) }) },
    ]);
  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <AppText weight="semibold" className="text-xl text-card-foreground">
          {t('title')}
        </AppText>
        <Badge variant={on ? 'success' : 'secondary'}>{on ? t('on') : t('off')}</Badge>
      </View>
      <AppText className="text-sm text-muted-foreground">{on ? t('onDescription') : `${t('offDescription')} ${t('enableDescription')}`}</AppText>
      {on ? (
        <Button variant="outline" loading={m.disable.isPending} onPress={disable}>
          {t('disable')}
        </Button>
      ) : (
        !reviewing && (
          <Button loading={m.prepare.isPending} onPress={() => m.prepare.mutate(undefined, { onSuccess: (r) => onStartReview(r.id), onError: (e) => Alert.alert(errorText(e)) })}>
            {t('enable')}
          </Button>
        )
      )}
    </Card>
  );
}

function ReviewCard({ previewId, onLeave }: { previewId: string; onLeave: () => void }) {
  const t = useT('invInventory.review');
  const reconciliation = useReconciliation(previewId);
  const lines = useReconciliationLines(previewId);
  const m = useInventoryMutations();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState(false);
  const loaded = useMemo(() => lines.data?.pages.flatMap((p) => p.items) ?? [], [lines.data]);
  const products = useProductsById(loaded.map((l) => l.productId));
  const names = new Map<string, string>();
  products.forEach((q) => q.data && names.set(q.data.id, `${q.data.name} · ${q.data.sku}`));

  const failure = reconciliation.error ?? lines.error;
  if (isApiError(failure, 'PREVIEW_STALE') || isApiError(failure, 'PREVIEW_EXPIRED') || isApiError(m.enable.error, 'PREVIEW_STALE')) {
    return (
      <Card>
        <AppText className="text-sm text-destructive">{t('stale')}</AppText>
        <Button variant="outline" onPress={onLeave}>
          {t('startNew')}
        </Button>
      </Card>
    );
  }
  if (failure) return <ErrorState error={failure} onRetry={() => void Promise.all([reconciliation.refetch(), lines.refetch()])} />;
  if (!reconciliation.data || !lines.data) return <LoadingState />;
  const r = reconciliation.data;
  const complete = r.confirmedCount >= r.productCount;

  const acknowledge = (page: ReconciliationLine[]) => {
    let bad = false;
    const batch = page.map((line) => {
      const raw = counts[line.productId];
      const value = raw === undefined ? line.availableCount : parseQuantityInput(raw, 0, QUANTITY_MAX - line.cancellationCreditQuantity);
      if (value == null) bad = true;
      return { productId: line.productId, expectedRevision: line.expectedRevision, availableCount: value ?? 0 };
    });
    setInvalid(bad);
    if (!bad) m.acknowledge.mutate({ previewId, expectedRevision: r.revision, lines: batch }, { onSuccess: () => void lines.refetch() });
  };

  return (
    <Card>
      <CardHeader title={t('title')} description={`${t('description')} ${t('expires', { time: formatDateTime(r.expiresAt) })}`} />
      <AppText weight="medium" className="text-sm text-foreground">
        {t('progress', { done: formatNumber(r.confirmedCount), total: formatNumber(r.productCount) })}
      </AppText>
      <CatalogueFormError error={m.acknowledge.error ?? m.enable.error} />
      {lines.data.pages.map((page, pi) => (
        <View key={pi} className="gap-2">
          {page.items.map((line) => (
            <View key={line.productId} className="flex-row items-center gap-2">
              <View className="flex-1 gap-1">
                <AppText className="text-sm text-foreground" numberOfLines={2}>
                  {names.get(line.productId) ?? '…'}
                </AppText>
                <Badge variant={line.acknowledged ? 'success' : 'outline'}>{line.acknowledged ? t('confirmed') : t('pending')}</Badge>
              </View>
              <View className="w-24">
                <Input
                  keyboardType="number-pad"
                  className="text-right font-mono"
                  accessibilityLabel={`${t('count')}: ${names.get(line.productId) ?? ''}`}
                  value={counts[line.productId] ?? String(line.availableCount)}
                  onChangeText={(v) => setCounts((c) => ({ ...c, [line.productId]: v }))}
                />
              </View>
            </View>
          ))}
          <Button size="sm" variant="outline" disabled={m.acknowledge.isPending || page.items.length === 0} onPress={() => acknowledge(page.items)}>
            {t('confirmPage', { count: page.items.length })}
          </Button>
        </View>
      ))}
      {invalid && <AppText className="text-sm text-destructive">{t('countInvalid', { max: formatNumber(QUANTITY_MAX) })}</AppText>}
      {lines.hasNextPage && (
        <Button variant="outline" loading={lines.isFetchingNextPage} onPress={() => void lines.fetchNextPage()}>
          {t('loadMore')}
        </Button>
      )}
      <Button disabled={!complete} loading={m.enable.isPending} onPress={() => m.enable.mutate({ previewId, expectedRevision: r.revision }, { onSuccess: onLeave })}>
        {t('finish')}
      </Button>
      {!complete && <AppText className="text-sm text-muted-foreground">{t('incomplete')}</AppText>}
      <Button variant="ghost" onPress={onLeave}>
        {t('cancel')}
      </Button>
    </Card>
  );
}

function StockList() {
  const t = useT('invInventory.stock');
  const tv = useT('mVendorCatalogue');
  const products = useInfiniteProducts({ size: 25, sort: 'NAME_ASC' });
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];
  const stocks = useStocks(items.map((p) => p.id));
  return (
    <Card>
      <CardHeader title={t('title')} />
      {products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : products.isPending ? (
        <LoadingState />
      ) : (
        <View className="overflow-hidden rounded-lg border border-border">
          {items.map((p, i) => {
            const stock = stocks[i]?.data;
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={tv('editAria', { name: p.name })}
                onPress={() => router.push({ pathname: '/vendor/product/[id]', params: { id: p.id } })}
                className={`flex-row items-center gap-3 p-3 active:bg-muted ${i > 0 ? 'border-t border-border' : ''}`}>
                <View className="flex-1 gap-1">
                  <AppText className="text-sm text-foreground" numberOfLines={2}>
                    {p.name}
                  </AppText>
                  <StockStatusBadge stock={stock} />
                </View>
                <AppText mono className="text-base text-foreground">
                  {stock?.availableCount == null ? '—' : formatNumber(stock.availableCount)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
      {products.hasNextPage && (
        <Button size="sm" variant="outline" loading={products.isFetchingNextPage} onPress={() => void products.fetchNextPage()}>
          {tv('loadMore')}
        </Button>
      )}
    </Card>
  );
}

function Events() {
  const t = useT('invInventory.events');
  const events = useStockEvents();
  const rows = useMemo(() => events.data?.pages.flatMap((p) => p.items) ?? [], [events.data]);
  const products = useProductsById([...new Set(rows.map((e) => e.productId))]);
  const names = new Map<string, string>();
  products.forEach((q) => q.data && names.set(q.data.id, q.data.name));
  return (
    <Card>
      <CardHeader title={t('title')} />
      {events.isError ? (
        <ErrorState error={events.error} onRetry={() => void events.refetch()} />
      ) : events.isPending ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">{t('empty')}</AppText>
      ) : (
        rows.map((e) => (
          <View key={e.id} className="gap-0.5">
            <AppText className="text-sm text-foreground">
              {`${names.get(e.productId) ?? '…'} · ${t(`type.${e.type}`)}${e.delta !== 0 ? ` ${e.delta > 0 ? '+' : ''}${formatNumber(e.delta)}` : ''} → ${formatNumber(e.after)}`}
            </AppText>
            <AppText className="text-xs text-muted-foreground">{`${formatDateTime(e.createdAt)}${e.reason ? ` · ${e.reason}` : e.orderId ? ` · ${t('fromOrder')}` : ''}`}</AppText>
          </View>
        ))
      )}
      {events.hasNextPage && (
        <Button size="sm" variant="outline" loading={events.isFetchingNextPage} onPress={() => void events.fetchNextPage()}>
          {t('loadMore')}
        </Button>
      )}
    </Card>
  );
}
