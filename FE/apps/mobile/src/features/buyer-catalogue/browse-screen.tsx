import { useDeferredValue, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { formatNumber, type Offer } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { AffixInput } from '@/components/ui/affix-input';
import { Chip } from '@/components/ui/chip';
import { useT } from '@/lib/i18n';
import { useTokenColors } from '@/theme';
import { ProductRow, ShelfCard } from './components';
import { useFeaturedOffers, useMostOrdered, useOfferList, useOfferTaxonomy } from './queries';
import { useVendorContext } from './vendor-context';

/** Buyer home on mobile: the active vendor's offers with search, category/tag chips, sort and shelves. */
export function BrowseScreen() {
  const t = useT('browse');
  const tm = useT('mCommon');
  const { active, isPending, error, refetch } = useVendorContext();
  if (isPending) return <LoadingState label={tm('loadingCatalogue')} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!active) return <EmptyState title={t('noVendorsTitle')} description={t('noVendorsDescription')} />;
  return <Browse key={active.vendorId} vendorId={active.vendorId} vendorName={active.displayName} />;
}

function Browse({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const c = useTokenColors();
  const t = useT('browse');
  const tm = useT('mCommon');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>();
  const [tagId, setTagId] = useState<string>();
  const [newest, setNewest] = useState(false);
  const q = useDeferredValue(search);
  const taxonomy = useOfferTaxonomy(vendorId);
  const featured = useFeaturedOffers(vendorId);
  const mostOrdered = useMostOrdered(vendorId);
  const offers = useOfferList(vendorId, { q, categoryId, tagId, sort: newest ? 'CREATED_DESC' : 'NAME_ASC' });
  const filtering = search.trim() !== '' || !!categoryId || !!tagId;

  if (offers.isPending) return <LoadingState label={tm('loadingCatalogue')} />;
  if (offers.isError) return <ErrorState error={offers.error} onRetry={() => void offers.refetch()} />;
  const items = offers.data.pages.flatMap((p) => p.items);
  const total = offers.data.pages[0]?.total ?? null;

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      keyboardShouldPersistTaps="handled"
      data={items}
      keyExtractor={(o) => o.product.id}
      onEndReachedThreshold={0.5}
      onEndReached={() => offers.hasNextPage && !offers.isFetchingNextPage && void offers.fetchNextPage()}
      ListHeaderComponent={
        <View className="gap-4 pt-3 pb-1">
          <View className="px-4">
            <AffixInput
              prefix={<Search size={16} color={c['muted-foreground']} />}
              value={search}
              maxLength={100}
              onChangeText={setSearch}
              placeholder={t('searchPlaceholder', { vendor: vendorName })}
              accessibilityLabel={t('searchAria')}
              autoCorrect={false}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4" accessibilityLabel={t('filterCategory')}>
            <Chip role="radio" label={t('allCategories')} selected={!categoryId} onPress={() => setCategoryId(undefined)} />
            {taxonomy.data?.categories.map((cat) => (
              <Chip key={cat.id} role="radio" label={cat.name} selected={categoryId === cat.id} onPress={() => setCategoryId(cat.id)} />
            ))}
          </ScrollView>
          {taxonomy.data && taxonomy.data.tags.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4" accessibilityLabel={t('filterTag')}>
              <Chip role="radio" label={t('allTags')} selected={!tagId} onPress={() => setTagId(undefined)} />
              {taxonomy.data.tags.map((tag) => (
                <Chip key={tag.id} role="radio" label={tag.name} selected={tagId === tag.id} onPress={() => setTagId(tag.id)} />
              ))}
            </ScrollView>
          )}
          {!filtering && <Shelf title={t('featuredBy', { vendor: vendorName })} items={featured.data} />}
          {!filtering && <Shelf title={t('mostOrdered')} items={mostOrdered.data} />}
          <View className="flex-row items-center justify-between px-4">
            <AppText weight="semibold" className="text-lg text-foreground">
              {total !== null ? `${filtering ? t('results') : t('allProducts')} · ${formatNumber(total)}` : filtering ? t('results') : t('allProducts')}
            </AppText>
            <Chip label={t('sortNewest')} selected={newest} onPress={() => setNewest((n) => !n)} />
          </View>
        </View>
      }
      renderItem={({ item }) => <ProductRow offer={item} />}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={<EmptyState title={filtering ? t('noMatches') : t('noProducts')} description={filtering ? t('noMatchesHint') : undefined} />}
      ListFooterComponent={offers.isFetchingNextPage ? <ActivityIndicator className="py-4" color={c.primary} /> : null}
      refreshControl={
        <RefreshControl
          refreshing={offers.isRefetching && !offers.isFetchingNextPage}
          onRefresh={() => void Promise.all([offers.refetch(), featured.refetch(), mostOrdered.refetch(), taxonomy.refetch()])}
          tintColor={c.primary}
          colors={[c.primary]}
        />
      }
    />
  );
}

function Shelf({ title, items }: { title: string; items: Offer[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <View className="gap-2" accessibilityLabel={title}>
      <AppText weight="semibold" className="px-4 text-lg text-foreground">
        {title}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4">
        {items.map((offer) => (
          <ShelfCard key={offer.product.id} offer={offer} />
        ))}
      </ScrollView>
    </View>
  );
}
