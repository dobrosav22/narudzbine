import { useDeferredValue, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { formatMoney, formatNumber, isAtLimit, LOW_STOCK_THRESHOLD, usageLine, type Product } from '@repo/core';
import { ProductImage } from '@/components/product-image';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { AffixInput } from '@/components/ui/affix-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useTokenColors } from '@/theme';
import { PlanLimitNotice } from '@/features/subscription/plan-limit';
import { useCategories, useVendorPlan, useVendorProducts } from './queries';
import { useMsg, useT } from '@/lib/i18n';

/**
 * Mobile vendor catalogue: search, category filter, tap to edit, add. Bulk edit
 * and category/tag management stay on web (table-first workflows — BUILD_LOG).
 */
export function VendorCatalogueScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const c = useTokenColors();
  const t = useT('vendorCatalogue');
  const tb = useT('browse');
  const tmc = useT('m.common');
  const tm = useMsg();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>();
  const deferredSearch = useDeferredValue(search);
  const categories = useCategories(vendorOrgId);
  const usage = useVendorPlan(vendorOrgId);
  const products = useVendorProducts({ vendorOrgId, search: deferredSearch, categoryId });
  const filtering = search !== '' || !!categoryId;

  if (products.isPending) return <LoadingState label={tmc('loadingCatalogue')} />;
  if (products.isError) return <ErrorState error={products.error} onRetry={() => void products.refetch()} />;

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      keyboardShouldPersistTaps="handled"
      data={products.data}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <View className="gap-3 pt-3 pb-1">
          <View className="px-4">
            <AffixInput
              prefix={<Search size={16} color={c['muted-foreground']} />}
              value={search}
              onChangeText={setSearch}
              placeholder={t('searchPlaceholder')}
              accessibilityLabel={tb('searchAria')}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          {categories.data && categories.data.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
              <Chip role="radio" label={tmc('all')} selected={!categoryId} onPress={() => setCategoryId(undefined)} />
              {categories.data.map((cat) => (
                <Chip key={cat.id} role="radio" label={cat.name} selected={categoryId === cat.id} onPress={() => setCategoryId(cat.id)} />
              ))}
            </ScrollView>
          )}
          <AppText className="px-4 text-sm text-muted-foreground">{usage.data ? tm(usageLine(usage.data, 'products')) : ' '}</AppText>
          {/* v1.1 hard block: the header's Add button is disabled at the limit too (see vendor tabs layout). */}
          {usage.data && isAtLimit(usage.data, 'products') && (
            <View className="px-4">
              <PlanLimitNotice plan={usage.data} limit="products" />
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => <ProductRow product={item} />}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={
        filtering ? (
          <EmptyState title={tb('noMatches')} description={tmc('noMatchesHint')} />
        ) : (
          <View className="gap-3">
            <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
            <View className="items-center">
              <Button onPress={() => router.push('/vendor/product/new')}>{t('addProduct')}</Button>
            </View>
          </View>
        )
      }
      refreshControl={
        <RefreshControl refreshing={products.isRefetching} onRefresh={() => void products.refetch()} tintColor={c.primary} colors={[c.primary]} />
      }
    />
  );
}

function ProductRow({ product: p }: { product: Product }) {
  const t = useT('vendorCatalogue');
  const tmo = useT('m.vendorCatalogue');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tmo('editAria', { name: p.name })}
      onPress={() => router.push({ pathname: '/vendor/product/[id]', params: { id: p.id } })}
      className={`flex-row gap-3 px-4 py-3 active:bg-muted ${p.isActive ? '' : 'opacity-60'}`}>
      <ProductImage src={p.imageUrl} className="size-12" />
      <View className="flex-1 gap-1">
        <AppText weight="medium" className="text-base text-foreground" numberOfLines={2}>
          {p.name}
        </AppText>
        <AppText mono className="text-xs text-muted-foreground">
          {p.sku}
        </AppText>
        <View className="flex-row flex-wrap gap-1.5">
          {!p.isActive && <Badge variant="secondary">{t('inactive')}</Badge>}
          {/* Stock only exists for vendors that track inventory (01 §3). */}
          {p.stock === 0 && <Badge variant="destructive">{t('outOfStock')}</Badge>}
          {p.stock !== undefined && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD && (
            <Badge variant="warning">{`${t('low')} · ${formatNumber(p.stock)}`}</Badge>
          )}
        </View>
      </View>
      <View className="items-end gap-1">
        <AppText mono weight="semibold" className="text-base text-foreground">
          {formatMoney(p.basePrice)}
        </AppText>
        <AppText className="text-xs text-muted-foreground">{tmo('perUnit', { unit: p.unit })}</AppText>
      </View>
    </Pressable>
  );
}
