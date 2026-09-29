import { FlatList, View } from 'react-native';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { useSignedIn } from '@/lib/session';
import { ProductRow } from './components';
import { useBuyerCatalogue, useFavorites } from './queries';
import { useT } from '@/lib/i18n';

/** 03 → buyer "Favorites": the user's favorites from the active vendor. */
export function FavoritesScreen() {
  const t = useT('favorites');
  const tm = useT('m.common');
  const { membership, activeVendor } = useSignedIn();
  const favorites = useFavorites(membership.user.id);
  const catalogue = useBuyerCatalogue({ vendorOrgId: activeVendor?.id ?? '', buyerOrgId: membership.org.id }, { search: '' });

  if (favorites.isError || catalogue.isError) {
    return <ErrorState error={favorites.error ?? catalogue.error} onRetry={() => void Promise.all([favorites.refetch(), catalogue.refetch()])} />;
  }
  if (favorites.isPending || catalogue.isPending) return <LoadingState label={tm('loadingFavorites')} />;

  const ids = new Set(favorites.data.map((f) => f.productId));
  const items = catalogue.data.filter((i) => ids.has(i.product.id));

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      data={items}
      keyExtractor={(i) => i.product.id}
      renderItem={({ item }) => <ProductRow item={item} />}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={<EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />}
    />
  );
}
