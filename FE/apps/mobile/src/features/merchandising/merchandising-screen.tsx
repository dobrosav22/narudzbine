import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ArrowDown, ArrowUp, X } from 'lucide-react-native';
import {
  describeDates,
  describeDiscount,
  describeScope,
  moveItem,
  promotionState,
  PROMOTION_STATE_KEY,
  sortPromotions,
  type Product,
  type PromotionState,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { SwitchRow } from '@/components/ui/switch-row';
import { SectionTitle } from '@/features/stats/parts';
import { useBuyerConnections, useCategories, useVendorProducts } from '@/features/vendor-catalogue/queries';
import { useTokenColors } from '@/theme';
import { useFeatured, usePromotions, useSetFeatured, useUpdatePromotion } from './queries';
import { useMsg, useT } from '@/lib/i18n';

const STATE_BADGE: Record<PromotionState, 'success' | 'info' | 'secondary' | 'outline'> = {
  live: 'success',
  scheduled: 'info',
  paused: 'secondary',
  ended: 'outline',
};

/**
 * 03 → "Featured & Promotions" on mobile: reorder/remove featured products and pause or
 * resume promotions. Adding featured products and creating/editing promotions (scope
 * pickers, date ranges) stay on web, like bulk edit and status settings.
 */
export function MerchandisingScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useT('m.merch');
  const tmc = useT('m.common');
  const featured = useFeatured(vendorOrgId);
  const promotions = usePromotions(vendorOrgId);
  const products = useVendorProducts({ vendorOrgId, search: '' });
  const categories = useCategories(vendorOrgId);
  const buyers = useBuyerConnections(vendorOrgId);

  const all = [featured, promotions, products, categories, buyers];
  const failed = all.find((q) => q.isError);
  const names = useMemo(
    () =>
      new Map<string, string>([
        ...(categories.data ?? []).map((x) => [x.id, x.name] as const),
        ...(products.data ?? []).map((p) => [p.id, p.name] as const),
        ...(buyers.data ?? []).map((b) => [b.buyerOrg.id, b.buyerOrg.name] as const),
      ]),
    [categories.data, products.data, buyers.data],
  );

  if (failed) return <ErrorState error={failed.error} onRetry={() => void Promise.all(all.map((q) => q.refetch()))} />;
  if (all.some((q) => q.isPending)) return <LoadingState label={tmc('loading')} />;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-4 pb-12">
      <FeaturedSection
        vendorOrgId={vendorOrgId}
        saved={featured.data!.map((f) => f.productId)}
        byId={new Map(products.data!.map((p) => [p.id, p]))}
      />
      <PromotionsSection vendorOrgId={vendorOrgId} names={names} />
      <AppText className="text-center text-sm text-muted-foreground">
        {t('webNote')}
      </AppText>
    </ScrollView>
  );
}

function FeaturedSection({ vendorOrgId, saved, byId }: { vendorOrgId: string; saved: string[]; byId: Map<string, Product> }) {
  const c = useTokenColors();
  const t = useT('merch.featured');
  const tmo = useT('m.merch');
  const tc = useT('common');
  const save = useSetFeatured(vendorOrgId);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const ids = draft ?? saved;
  const dirty = draft !== null && draft.join() !== saved.join();
  const edit = (next: string[]) => {
    if (save.error) save.reset();
    setJustSaved(false);
    setDraft(next);
  };

  return (
    <View className="gap-3">
      <SectionTitle>{t('title')}</SectionTitle>
      <View className="overflow-hidden rounded-xl border border-border" accessibilityLabel={t('listAria')}>
        {ids.length === 0 ? (
          <AppText className="p-4 text-sm text-muted-foreground">{tmo('featuredEmpty')}</AppText>
        ) : (
          ids.map((id, i) => {
            const p = byId.get(id);
            const name = p?.name ?? t('deletedProduct');
            return (
              <View key={id}>
                {i > 0 && <View className="h-px bg-border" />}
                <View className="flex-row items-center gap-2 bg-background py-2 pl-3 pr-1">
                  <AppText mono className="w-5 text-right text-sm text-muted-foreground">
                    {String(i + 1)}
                  </AppText>
                  <View className="flex-1 gap-1">
                    <AppText className="text-sm text-foreground" numberOfLines={2}>
                      {name}
                    </AppText>
                    {(!p || !p.isActive) && <Badge variant="warning">{t('hidden')}</Badge>}
                  </View>
                  <IconButton label={t('moveUp', { name })} disabled={i === 0} onPress={() => edit(moveItem(ids, i, -1))}>
                    <ArrowUp size={18} color={c.foreground} />
                  </IconButton>
                  <IconButton label={t('moveDown', { name })} disabled={i === ids.length - 1} onPress={() => edit(moveItem(ids, i, 1))}>
                    <ArrowDown size={18} color={c.foreground} />
                  </IconButton>
                  <IconButton label={t('remove', { name })} onPress={() => edit(ids.filter((x) => x !== id))}>
                    <X size={18} color={c.foreground} />
                  </IconButton>
                </View>
              </View>
            );
          })
        )}
      </View>
      <FormError error={save.error} />
      {justSaved && !dirty && (
        <AppText accessibilityRole="alert" className="text-sm text-success">
          {tmo('featuredSaved')}
        </AppText>
      )}
      {dirty && (
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" disabled={save.isPending} onPress={() => setDraft(null)}>
            {tc('discard')}
          </Button>
          <Button
            className="flex-1"
            loading={save.isPending}
            onPress={() =>
              save.mutate(ids, {
                onSuccess: () => {
                  setDraft(null);
                  setJustSaved(true);
                },
              })
            }>
            {t('save')}
          </Button>
        </View>
      )}
    </View>
  );
}

function PromotionsSection({ vendorOrgId, names }: { vendorOrgId: string; names: ReadonlyMap<string, string> }) {
  const tmo = useT('m.merch');
  const tm = useMsg();
  const promotions = usePromotions(vendorOrgId);
  const update = useUpdatePromotion(vendorOrgId);
  const rows = useMemo(() => sortPromotions(promotions.data ?? []), [promotions.data]);

  return (
    <View className="gap-3">
      <SectionTitle>{tmo('promotions')}</SectionTitle>
      <AppText className="text-sm text-muted-foreground">{tmo('promotionsNote')}</AppText>
      <FormError error={update.error} />
      <View className="overflow-hidden rounded-xl border border-border">
        {rows.length === 0 ? (
          <AppText className="p-4 text-sm text-muted-foreground">{tmo('noPromotions')}</AppText>
        ) : (
          rows.map((p, i) => {
            const state = promotionState(p);
            return (
              <View key={p.id}>
                {i > 0 && <View className="h-px bg-border" />}
                <View className="gap-2 bg-background p-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <AppText className="flex-1 text-sm text-muted-foreground" numberOfLines={1}>
                      {describeDates(p)}
                    </AppText>
                    <Badge variant={STATE_BADGE[state]}>{tm({ key: PROMOTION_STATE_KEY[state] })}</Badge>
                  </View>
                  {state === 'ended' ? (
                    <View className="gap-0.5">
                      <AppText weight="medium" className="text-base text-muted-foreground">
                        {tm(describeDiscount(p))}
                      </AppText>
                      <AppText className="text-sm text-muted-foreground">{tm(describeScope(p, names))}</AppText>
                    </View>
                  ) : (
                    <SwitchRow
                      label={`${tm(describeDiscount(p))} · ${tm(describeScope(p, names))}`}
                      description={p.isActive ? tmo('on') : tmo('paused')}
                      value={p.isActive}
                      onValueChange={(isActive) => update.mutate({ promotionId: p.id, fields: { isActive } })}
                    />
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function IconButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className={`size-10 items-center justify-center rounded-lg active:bg-muted ${disabled ? 'opacity-30' : ''}`}>
      {children}
    </Pressable>
  );
}
