import { useDeferredValue, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Pencil, Search, Trash2, X } from 'lucide-react-native';
import { formatNumber, isApiError, productLimitReached, TAXONOMY_NAME_MAX, uuidv7, type Product, type TaxonomyItem, type TaxonomyKind } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { AffixInput } from '@/components/ui/affix-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';
import { AssetImage, ProductStateBadge, useCatalogueErrorText } from './parts';
import { useInfiniteProducts, usePlanUsage, useTaxonomy, useTaxonomyMutations } from './queries';

type Segment = 'products' | TaxonomyKind;
type StateFilter = 'all' | Product['state'];

/** Mobile vendor catalogue: products (search/filter/infinite list) plus taxonomy management. */
export function VendorCatalogueScreen() {
  const t = useT('mVendorCatalogue');
  const [segment, setSegment] = useState<Segment>('products');
  return (
    <View className="flex-1 bg-background">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="gap-2 px-4 pt-3 pb-2">
        {(['products', 'categories', 'tags', 'units'] as const).map((s) => (
          <Chip key={s} role="radio" label={t(`segment.${s}`)} selected={segment === s} onPress={() => setSegment(s)} />
        ))}
      </ScrollView>
      {segment === 'products' ? <ProductList /> : <TaxonomyList key={segment} kind={segment} />}
    </View>
  );
}

function ProductList() {
  const c = useTokenColors();
  const t = useT('vendorCatalogue');
  const tm = useT('mVendorCatalogue');
  const tmc = useT('mCommon');
  const [search, setSearch] = useState('');
  const [state, setState] = useState<StateFilter>('all');
  const [categoryId, setCategoryId] = useState<string>();
  const q = useDeferredValue(search.trim());
  const categories = useTaxonomy('categories');
  const plan = usePlanUsage();
  const products = useInfiniteProducts({
    size: 25,
    sort: 'NAME_ASC',
    ...(q ? { q } : {}),
    ...(state !== 'all' ? { state } : {}),
    ...(categoryId ? { categoryId } : {}),
  });
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];
  const filtering = !!q || state !== 'all' || !!categoryId;
  const atLimit = productLimitReached(plan.data);

  return (
    <FlatList
      className="flex-1"
      contentContainerClassName="pb-8"
      keyboardShouldPersistTaps="handled"
      data={items}
      keyExtractor={(p) => p.id}
      onEndReached={() => products.hasNextPage && !products.isFetchingNextPage && void products.fetchNextPage()}
      ListHeaderComponent={
        <View className="gap-3 pb-1">
          <View className="px-4">
            <AffixInput
              prefix={<Search size={16} color={c['muted-foreground']} />}
              value={search}
              maxLength={100}
              onChangeText={setSearch}
              placeholder={t('searchPlaceholder')}
              accessibilityLabel={t('searchAria')}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
            <Chip role="radio" label={t('allStates')} selected={state === 'all'} onPress={() => setState('all')} />
            {(['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const).map((s) => (
              <Chip key={s} role="radio" label={t(`state.${s}`)} selected={state === s} onPress={() => setState(s)} />
            ))}
          </ScrollView>
          {categories.data && categories.data.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
              <Chip role="radio" label={t('allCategories')} selected={!categoryId} onPress={() => setCategoryId(undefined)} />
              {categories.data.map((cat) => (
                <Chip key={cat.id} role="radio" label={cat.name} selected={categoryId === cat.id} onPress={() => setCategoryId(cat.id)} />
              ))}
            </ScrollView>
          )}
          <View className="flex-row flex-wrap gap-2 px-4">
            <Button size="sm" variant="outline" onPress={() => router.push('/vendor/inventory')}>
              {t('inventory')}
            </Button>
            <Button size="sm" variant="outline" onPress={() => router.push('/vendor/merchandising')}>
              {tm('merchandising')}
            </Button>
            <Button size="sm" disabled={atLimit} onPress={() => router.push('/vendor/product/new')}>
              {t('addProduct')}
            </Button>
          </View>
          <AppText className="px-4 text-sm text-muted-foreground">
            {plan.data
              ? t('usage', {
                  count: plan.data.nonArchivedProductCount,
                  countText: formatNumber(plan.data.nonArchivedProductCount),
                  limit: formatNumber(plan.data.plan.productLimit),
                })
              : ' '}
          </AppText>
          {atLimit && (
            <View className="mx-4 gap-2 rounded-lg border border-border bg-card p-3">
              <AppText weight="medium" className="text-sm text-foreground">
                {t('planLimit.title')}
              </AppText>
              <AppText className="text-sm text-muted-foreground">
                {t('planLimit.description', { limit: formatNumber(plan.data!.plan.productLimit) })}
              </AppText>
              <Button size="sm" variant="outline" className="self-start" onPress={() => router.push('/vendor/plan')}>
                {t('planLimit.link')}
              </Button>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => <ProductRow product={item} />}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={
        products.isPending ? (
          <LoadingState label={tmc('loadingCatalogue')} />
        ) : products.isError ? (
          <ErrorState error={products.error} onRetry={() => void products.refetch()} />
        ) : (
          <EmptyState title={filtering ? t('noMatches') : t('emptyTitle')} description={filtering ? t('noMatchesHint') : t('emptyDescription')} />
        )
      }
      ListFooterComponent={products.isFetchingNextPage ? <LoadingState /> : null}
      refreshControl={<RefreshControl refreshing={products.isRefetching} onRefresh={() => void products.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}

function ProductRow({ product: p }: { product: Product }) {
  const t = useT('vendorCatalogue');
  const tm = useT('mVendorCatalogue');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tm('editAria', { name: p.name })}
      onPress={() => router.push({ pathname: '/vendor/product/[id]', params: { id: p.id } })}
      className={`flex-row gap-3 px-4 py-3 active:bg-muted ${p.state === 'ACTIVE' ? '' : 'opacity-70'}`}>
      <AssetImage assetId={p.galleryAssetIds[0]} className="size-12" />
      <View className="flex-1 gap-1">
        <AppText weight="medium" className="text-base text-foreground" numberOfLines={2}>
          {p.name}
        </AppText>
        <AppText mono className="text-xs text-muted-foreground">
          {p.sku}
        </AppText>
        <View className="flex-row flex-wrap gap-1.5">
          <ProductStateBadge state={p.state} />
          {p.featured && <Badge variant="info">{t('featured')}</Badge>}
        </View>
      </View>
    </Pressable>
  );
}

function TaxonomyList({ kind }: { kind: TaxonomyKind }) {
  const t = useT('taxonomy');
  const tk = useT(`taxonomy.kind.${kind}`);
  const tc = useT('common');
  const errorText = useCatalogueErrorText();
  const query = useTaxonomy(kind);
  const m = useTaxonomyMutations(kind);
  const [name, setName] = useState('');
  const [intentId, setIntentId] = useState(() => uuidv7());
  const [problem, setProblem] = useState<string>();
  const max = TAXONOMY_NAME_MAX[kind];

  const create = () => {
    const value = name.trim();
    if (!value) return setProblem(t('nameRequired'));
    if (Array.from(value).length > max) return setProblem(t('tooLong', { max }));
    m.create.mutate(
      { id: intentId, name: value },
      {
        onSuccess: () => {
          setName('');
          setIntentId(uuidv7());
        },
        onError: (e) => setProblem(errorText(e)),
      },
    );
  };

  const remove = (item: TaxonomyItem) =>
    Alert.alert(tk('deleteTitle', { name: item.name }), tk('deleteNote'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () =>
          m.remove.mutate(
            { id: item.id, expectedRevision: item.revision, name: item.name },
            { onError: (e) => Alert.alert(isApiError(e, 'RESOURCE_REFERENCED') ? t('inUse', { name: item.name }) : errorText(e)) },
          ),
      },
    ]);

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 p-4 pb-12">
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-1">
          <Input
            value={name}
            placeholder={tk('new')}
            accessibilityLabel={tk('new')}
            onChangeText={(v) => {
              setName(v);
              setProblem(undefined);
              if (m.create.isError) setIntentId(uuidv7());
              m.create.reset();
            }}
            onSubmitEditing={create}
          />
          <FieldError>{problem}</FieldError>
        </View>
        <Button loading={m.create.isPending} disabled={!name.trim()} onPress={create}>
          {tc('add')}
        </Button>
      </View>
      {query.data.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">{tk('empty')}</AppText>
      ) : (
        <View className="overflow-hidden rounded-xl border border-border">
          {query.data.map((item, i) => (
            <View key={item.id}>
              {i > 0 && <View className="h-px bg-border" />}
              <TaxonomyRow kind={kind} item={item} onDelete={() => remove(item)} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function TaxonomyRow({ kind, item, onDelete }: { kind: TaxonomyKind; item: TaxonomyItem; onDelete: () => void }) {
  const c = useTokenColors();
  const t = useT('taxonomy');
  const tc = useT('common');
  const errorText = useCatalogueErrorText();
  const m = useTaxonomyMutations(kind);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [problem, setProblem] = useState<string>();
  const frozen = 'nameFrozen' in item && item.nameFrozen;

  const save = () => {
    const value = name.trim();
    if (!value) return setProblem(t('nameRequired'));
    m.rename.mutate({ id: item.id, expectedRevision: item.revision, name: value }, { onSuccess: () => setEditing(false), onError: (e) => setProblem(errorText(e)) });
  };

  if (editing) {
    return (
      <View className="gap-1 p-3">
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Input autoFocus value={name} accessibilityLabel={t('renameAria', { name: item.name })} onChangeText={setName} onSubmitEditing={save} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={tc('save')} hitSlop={8} onPress={save}>
            <Check size={20} color={c.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={tc('cancel')} hitSlop={8} onPress={() => setEditing(false)}>
            <X size={20} color={c['muted-foreground']} />
          </Pressable>
        </View>
        <FieldError>{problem}</FieldError>
      </View>
    );
  }
  return (
    <View className="flex-row items-center gap-3 p-3">
      <View className="flex-1 gap-1">
        <AppText className="text-sm text-foreground">{item.name}</AppText>
        {frozen && <Badge variant="outline">{t('frozen')}</Badge>}
      </View>
      {!frozen && (
        <Pressable accessibilityRole="button" accessibilityLabel={t('renameAria', { name: item.name })} hitSlop={8} onPress={() => setEditing(true)}>
          <Pencil size={18} color={c['muted-foreground']} />
        </Pressable>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel={t('deleteAria', { name: item.name })} hitSlop={8} onPress={onDelete}>
        <Trash2 size={18} color={c['muted-foreground']} />
      </Pressable>
    </View>
  );
}
