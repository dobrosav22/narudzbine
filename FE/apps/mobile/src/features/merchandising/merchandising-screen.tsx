import { useDeferredValue, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { formatDateTime, formatMoney, formatPercent, promotionActions, type Product, type Promotion, type PromotionState } from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { AffixInput } from '@/components/ui/affix-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';
import { ProductStateBadge, useCatalogueErrorText } from '@/features/vendor-catalogue/parts';
import { useAllProducts, useProducts, useSetFeatured } from '@/features/vendor-catalogue/queries';
import { usePromotionMutations, usePromotions } from './queries';

const STATE_BADGE: Record<PromotionState, 'success' | 'info' | 'secondary' | 'outline'> = {
  RUNNING: 'success',
  SCHEDULED: 'info',
  STOPPED: 'secondary',
  ENDED: 'outline',
};

/**
 * Featured products and promotions on mobile: feature/unfeature, stop and archive promotions.
 * Creating and editing promotions (target pickers, schedules) is on the web.
 */
export function MerchandisingScreen() {
  const t = useT('mMerch');
  return (
    <ScrollView className="flex-1 bg-background" keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 p-4 pb-12">
      <FeaturedSection />
      <PromotionsSection />
      <AppText className="text-center text-sm text-muted-foreground">{t('webNote')}</AppText>
    </ScrollView>
  );
}

function FeaturedSection() {
  const c = useTokenColors();
  const t = useT('merch.featured');
  const errorText = useCatalogueErrorText();
  const all = useAllProducts();
  const setFeatured = useSetFeatured();
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const results = useProducts({ page: 0, size: 8, ...(q ? { q } : {}) });
  const featured = (all.data ?? []).filter((p) => p.featured);
  const toggle = (product: Product, on: boolean) => setFeatured.mutate({ product, featured: on }, { onError: (e) => Alert.alert(errorText(e)) });

  return (
    <Card>
      <CardHeader title={t('heading')} description={t('subtitle')} />
      {all.isError ? (
        <ErrorState error={all.error} onRetry={() => void all.refetch()} />
      ) : all.isPending ? (
        <LoadingState />
      ) : featured.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">{t('emptyDescription')}</AppText>
      ) : (
        <View className="overflow-hidden rounded-lg border border-border">
          {featured.map((p, i) => (
            <View key={p.id} className={`flex-row items-center gap-2 p-3 ${i > 0 ? 'border-t border-border' : ''}`}>
              <View className="flex-1 gap-1">
                <AppText className="text-sm text-foreground" numberOfLines={2}>
                  {p.name}
                </AppText>
                {p.state !== 'ACTIVE' && <Badge variant="warning">{t('hidden')}</Badge>}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('unfeatureAria', { name: p.name })} hitSlop={8} disabled={setFeatured.isPending} onPress={() => toggle(p, false)}>
                <X size={18} color={c['muted-foreground']} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <AppText weight="medium" className="text-sm text-foreground">
        {t('addTitle')}
      </AppText>
      <AffixInput
        prefix={<Search size={16} color={c['muted-foreground']} />}
        value={search}
        maxLength={100}
        onChangeText={setSearch}
        placeholder={t('searchPlaceholder')}
        accessibilityLabel={t('searchAria')}
        autoCorrect={false}
      />
      {results.data?.items.map((p) => (
        <View key={p.id} className="flex-row items-center gap-2">
          <View className="flex-1 gap-1">
            <AppText className="text-sm text-foreground" numberOfLines={1}>
              {p.name}
            </AppText>
            <ProductStateBadge state={p.state} />
          </View>
          {p.featured ? (
            <Badge variant="info">{t('alreadyFeatured')}</Badge>
          ) : (
            <Button size="sm" variant="outline" accessibilityLabel={t('featureAria', { name: p.name })} disabled={setFeatured.isPending} onPress={() => toggle(p, true)}>
              {t('feature')}
            </Button>
          )}
        </View>
      ))}
      {results.data?.items.length === 0 && <AppText className="text-sm text-muted-foreground">{t('noResults')}</AppText>}
    </Card>
  );
}

function PromotionsSection() {
  const t = useT('merch.promotions');
  const tm = useT('mVendorCatalogue');
  const [size, setSize] = useState(25);
  const promotions = usePromotions({ page: 0, size, includeTotal: true });
  const rows = promotions.data?.items ?? [];
  return (
    <Card>
      <CardHeader title={t('heading')} description={t('subtitle')} />
      {promotions.isError ? (
        <ErrorState error={promotions.error} onRetry={() => void promotions.refetch()} />
      ) : promotions.isPending ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">{t('emptyDescription')}</AppText>
      ) : (
        rows.map((p) => <PromotionRow key={p.id} promotion={p} />)
      )}
      {(promotions.data?.total ?? 0) > rows.length && size < 100 && (
        <Button size="sm" variant="outline" onPress={() => setSize(100)}>
          {tm('loadMore')}
        </Button>
      )}
    </Card>
  );
}

function PromotionRow({ promotion: p }: { promotion: Promotion }) {
  const t = useT('merch.promotions');
  const tc = useT('common');
  const errorText = useCatalogueErrorText();
  const { organization } = useBusiness();
  const m = usePromotionMutations();
  const actions = promotionActions(p);
  const discount = p.kind === 'PERCENTAGE' ? t('percentOff', { value: formatPercent(p.value) }) : t('fixedPrice', { price: formatMoney(p.value, organization.currency) });
  const targets =
    p.targets.productMode === 'ALL'
      ? t('allProducts')
      : t('targets', {
          products: p.targets.productIds.length,
          categories: p.targets.categoryIds.length,
          both: p.targets.productIds.length > 0 && p.targets.categoryIds.length > 0 ? 'yes' : 'no',
        });
  const buyers = p.targets.buyerMode === 'ALL' ? t('allBuyers') : t('someBuyers', { count: p.targets.buyerIds.length });
  const confirm = (action: 'stop' | 'archive') =>
    Alert.alert(action === 'stop' ? t('stopTitle', { name: p.name }) : t('archiveTitle', { name: p.name }), action === 'stop' ? t('stopDescription') : t('archiveDescription'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: action === 'stop' ? t('stop') : t('archive'),
        style: action === 'stop' ? 'destructive' : 'default',
        onPress: () => (action === 'stop' ? m.stop : m.archive).mutate({ id: p.id, expectedRevision: p.revision }, { onError: (e) => Alert.alert(errorText(e)) }),
      },
    ]);

  return (
    <View className="gap-2 rounded-lg border border-border p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <AppText weight="medium" className="flex-1 text-sm text-foreground">
          {p.name}
        </AppText>
        <Badge variant={STATE_BADGE[p.state]}>{t(`state.${p.state}`)}</Badge>
        {p.archived && <Badge variant="outline">{t('archived')}</Badge>}
      </View>
      <AppText mono className="text-sm text-foreground">
        {discount}
      </AppText>
      <AppText className="text-sm text-muted-foreground">{`${targets} · ${buyers}`}</AppText>
      <AppText className="text-xs text-muted-foreground">{t('range', { start: formatDateTime(p.startsAt), end: formatDateTime(p.endsAt) })}</AppText>
      {(actions.stop || actions.archive) && (
        <View className="flex-row gap-2">
          {actions.stop && (
            <Button size="sm" variant="destructive" loading={m.stop.isPending} onPress={() => confirm('stop')}>
              {t('stop')}
            </Button>
          )}
          {actions.archive && (
            <Button size="sm" variant="outline" loading={m.archive.isPending} onPress={() => confirm('archive')}>
              {t('archive')}
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
