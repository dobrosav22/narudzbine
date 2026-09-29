import { useDeferredValue, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { formatNumber, type CatalogueItem } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { AffixInput } from '@/components/ui/affix-input';
import { Chip } from '@/components/ui/chip';
import { useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { ProductRow, ShelfCard } from './components';
import { useBuyerCatalogue, useBuyerShelves, useCategories } from './queries';
import { useT } from '@/lib/i18n';

/** 03 → buyer "Catalogue browse (Home)" on mobile: shelves + search + category chips. */
export function BrowseScreen() {
  const t = useT('browse');
  const { membership, activeVendor } = useSignedIn();
  if (!activeVendor) {
    return <EmptyState title={t('noVendorsTitle')} description={t('noVendorsDescription')} />;
  }
  // key: switching vendor resets filters.
  return <Browse key={activeVendor.id} vendorOrgId={activeVendor.id} vendorName={activeVendor.name} buyerOrgId={membership.org.id} />;
}

function Browse({ vendorOrgId, vendorName, buyerOrgId }: { vendorOrgId: string; vendorName: string; buyerOrgId: string }) {
  const c = useTokenColors();
  const t = useT('browse');
  const tm = useT('m.common');
  const scope = { vendorOrgId, buyerOrgId };
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>();
  const deferredSearch = useDeferredValue(search);
  const categories = useCategories(vendorOrgId);
  const shelves = useBuyerShelves(scope);
  const catalogue = useBuyerCatalogue(scope, { search: deferredSearch, categoryId });
  const filtering = search !== '' || !!categoryId;

  if (catalogue.isPending) return <LoadingState label={tm('loadingCatalogue')} />;
  if (catalogue.isError) return <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />;

  const mostOrderedExtra = (i: CatalogueItem) => {
    const m = shelves.data?.mostOrdered.find((x) => x.product.id === i.product.id);
    return m ? t('orderedTimes', { count: formatNumber(m.orderCount) }) : undefined;
  };

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      keyboardShouldPersistTaps="handled"
      data={catalogue.data}
      keyExtractor={(i) => i.product.id}
      ListHeaderComponent={
        <View className="gap-4 pt-3 pb-1">
          <View className="px-4">
            <AffixInput
              prefix={<Search size={16} color={c['muted-foreground']} />}
              value={search}
              onChangeText={setSearch}
              placeholder={t('searchPlaceholder', { vendor: vendorName })}
              accessibilityLabel={t('searchAria')}
              autoCorrect={false}
            />
          </View>
          {categories.data && categories.data.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
              <Chip role="radio" label={tm('all')} selected={!categoryId} onPress={() => setCategoryId(undefined)} />
              {categories.data.map((cat) => (
                <Chip key={cat.id} role="radio" label={cat.name} selected={categoryId === cat.id} onPress={() => setCategoryId(cat.id)} />
              ))}
            </ScrollView>
          )}
          {!filtering && shelves.isError && <ErrorState error={shelves.error} onRetry={() => void shelves.refetch()} />}
          {!filtering && shelves.data && shelves.data.featured.length > 0 && (
            <Shelf title={t('featuredBy', { vendor: vendorName })} items={shelves.data.featured} />
          )}
          {!filtering && shelves.data && shelves.data.mostOrdered.length > 0 && (
            <Shelf title={t('mostOrdered')} items={shelves.data.mostOrdered} extra={mostOrderedExtra} />
          )}
          <AppText weight="semibold" className="px-4 text-lg text-foreground">
            {`${filtering ? t('results') : t('allProducts')} · ${formatNumber(catalogue.data.length)}`}
          </AppText>
        </View>
      }
      renderItem={({ item }) => <ProductRow item={item} />}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={
        <EmptyState
          title={filtering ? t('noMatches') : t('noProducts')}
          description={filtering ? tm('noMatchesHint') : undefined}
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={catalogue.isRefetching}
          onRefresh={() => void Promise.all([catalogue.refetch(), shelves.refetch()])}
          tintColor={c.primary}
          colors={[c.primary]}
        />
      }
    />
  );
}

function Shelf({ title, items, extra }: { title: string; items: CatalogueItem[]; extra?: (i: CatalogueItem) => string | undefined }) {
  return (
    <View className="gap-2" accessibilityLabel={title}>
      <AppText weight="semibold" className="px-4 text-lg text-foreground">
        {title}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4">
        {items.map((item) => (
          <ShelfCard key={item.product.id} item={item} extra={extra?.(item)} />
        ))}
      </ScrollView>
    </View>
  );
}
