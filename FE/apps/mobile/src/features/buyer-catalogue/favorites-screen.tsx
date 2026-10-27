import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { formatDate, splitFavorites } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { useErrorText, useT } from '@/lib/i18n';
import { useTokenColors } from '@/theme';
import { Notice, ProductRow } from './components';
import { useFavorites, useToggleFavorite } from './queries';
import { useVendorContext } from './vendor-context';

/** Organization-shared favorites: the active vendor's available ones, then unavailable references to remove. */
export function FavoritesScreen() {
  const c = useTokenColors();
  const t = useT('favorites');
  const tm = useT('mCommon');
  const errorText = useErrorText();
  const vendor = useVendorContext();
  const favorites = useFavorites();
  const toggle = useToggleFavorite();
  const [error, setError] = useState<string>();

  if (favorites.isError) return <ErrorState error={favorites.error} onRetry={() => void favorites.refetch()} />;
  if (favorites.isPending || vendor.isPending) return <LoadingState label={tm('loadingFavorites')} />;
  const { current, unavailable } = splitFavorites(favorites.data, vendor.active?.vendorId ?? null);

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      data={current}
      keyExtractor={(f) => f.productId}
      ListHeaderComponent={
        <View className="gap-1 px-4 pt-3 pb-2">
          <AppText className="text-sm text-muted-foreground">{vendor.active ? t('from', { vendor: vendor.active.displayName }) : t('shared')}</AppText>
          {error && <Notice text={error} tone="error" />}
        </View>
      }
      renderItem={({ item }) => <ProductRow offer={item.offer!} />}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={<EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />}
      ListFooterComponent={
        unavailable.length > 0 ? (
          <View className="mx-4 mt-6 gap-2">
            <AppText weight="semibold" className="text-base text-foreground">
              {t('unavailableTitle')}
            </AppText>
            <AppText className="text-sm text-muted-foreground">{t('unavailableDescription')}</AppText>
            <View className="overflow-hidden rounded-lg border border-border">
              {unavailable.map((f, i) => (
                <View key={f.productId}>
                  {i > 0 && <View className="h-px bg-border" />}
                  <View className="flex-row items-center gap-3 px-3 py-2">
                    <AppText className="flex-1 text-sm text-muted-foreground">{t('savedOn', { date: formatDate(f.createdAt) })}</AppText>
                    <Button
                      size="sm"
                      variant="ghost"
                      accessibilityLabel={t('removeUnavailable', { date: formatDate(f.createdAt) })}
                      disabled={toggle.isPending}
                      onPress={() => toggle.mutate({ productId: f.productId, on: false }, { onError: (e) => setError(errorText(e)) })}>
                      {t('remove')}
                    </Button>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null
      }
      refreshControl={<RefreshControl refreshing={favorites.isRefetching} onRefresh={() => void favorites.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}
