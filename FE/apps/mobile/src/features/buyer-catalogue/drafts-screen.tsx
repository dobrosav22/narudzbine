import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { cartFromDraft, formatDateTime, formatNumber, type Draft } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cartStore } from '@/lib/cart';
import { useErrorText, useT } from '@/lib/i18n';
import { sessionStore, useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { Notice } from './components';
import { useActiveLocations, useDiscardDraft, useDrafts } from './queries';
import { useVendorContext } from './vendor-context';

type Resume = { draft: Draft; then: 'cart' | 'checkout' };

/** Organization-shared saved drafts on mobile: open in cart, review and submit, or discard. */
export function DraftsScreen() {
  const c = useTokenColors();
  const t = useT('buyDrafts');
  const tm = useT('mCommon');
  const errorText = useErrorText();
  const { organization } = useBusiness();
  const vendors = useVendorContext();
  const drafts = useDrafts();
  const locations = useActiveLocations();
  const discard = useDiscardDraft();
  const [confirm, setConfirm] = useState<{ kind: 'resume'; resume: Resume } | { kind: 'discard'; draft: Draft }>();
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' }>();

  if (drafts.isError) return <ErrorState error={drafts.error} onRetry={() => void drafts.refetch()} />;
  if (drafts.isPending) return <LoadingState label={tm('loading')} />;
  const items = drafts.data.pages.flatMap((p) => p.items);
  const vendorName = (id: string) => vendors.vendors.find((v) => v.vendorId === id)?.displayName;
  const locationName = (id: string | null) => (id ? locations.data?.find((l) => l.id === id)?.name ?? t('archivedLocation') : t('noLocation'));

  const resume = async ({ draft, then }: Resume) => {
    const scope = { buyerOrgId: organization.id, vendorId: draft.intent.vendorId };
    await cartStore.hydrate(scope);
    const pending = cartStore.getState(scope).pendingSubmission;
    cartStore.replace(scope, { ...cartFromDraft(draft), pendingSubmission: pending });
    await sessionStore.selectVendor(draft.intent.vendorId);
    setConfirm(undefined);
    if (then === 'cart') router.navigate('/buyer/cart');
    else router.push('/buyer/checkout');
  };
  const requestResume = async (r: Resume) => {
    const scope = { buyerOrgId: organization.id, vendorId: r.draft.intent.vendorId };
    await cartStore.hydrate(scope);
    const current = cartStore.getState(scope);
    if (current.lines.length > 0 && current.draft?.id !== r.draft.id) setConfirm({ kind: 'resume', resume: r });
    else await resume(r);
  };

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4 pb-10"
      data={items}
      keyExtractor={(d) => d.id}
      onEndReached={() => drafts.hasNextPage && !drafts.isFetchingNextPage && void drafts.fetchNextPage()}
      ListHeaderComponent={
        <View className="gap-2">
          <Stack.Screen options={{ title: t('title') }} />
          <AppText className="text-sm text-muted-foreground">{t('description')}</AppText>
          {notice && <Notice text={notice.text} tone={notice.tone} />}
          {confirm && (
            <View accessibilityRole="alert" className="gap-2 rounded-lg border border-border bg-card p-3">
              <AppText weight="medium" className="text-sm text-foreground">
                {confirm.kind === 'resume' ? t('replaceTitle') : t('discardTitle')}
              </AppText>
              <AppText className="text-sm text-muted-foreground">{confirm.kind === 'resume' ? t('replaceDescription') : t('discardDescription')}</AppText>
              <View className="flex-row gap-2">
                <Button size="sm" variant="outline" onPress={() => setConfirm(undefined)}>
                  {t('cancel')}
                </Button>
                {confirm.kind === 'resume' ? (
                  <Button size="sm" onPress={() => void resume(confirm.resume)}>
                    {t('replace')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    loading={discard.isPending}
                    onPress={() => {
                      const draft = confirm.draft;
                      discard.mutate(
                        { draftId: draft.id, revision: draft.revision },
                        {
                          onSuccess: () => {
                            const scope = { buyerOrgId: organization.id, vendorId: draft.intent.vendorId };
                            if (cartStore.getState(scope).draft?.id === draft.id) cartStore.linkDraft(scope, null);
                            setNotice({ text: t('discarded'), tone: 'success' });
                          },
                          onError: (e) => setNotice({ text: errorText(e), tone: 'error' }),
                          onSettled: () => setConfirm(undefined),
                        },
                      );
                    }}>
                    {t('discard')}
                  </Button>
                )}
              </View>
            </View>
          )}
        </View>
      }
      renderItem={({ item: draft }) => {
        const name = vendorName(draft.intent.vendorId);
        const units = draft.intent.lines.reduce((n, l) => n + l.quantity, 0);
        return (
          <View className="gap-2 rounded-xl border border-border bg-card p-4">
            <View className="flex-row flex-wrap items-center gap-2">
              <AppText weight="medium" className="text-base text-foreground">
                {name ?? t('disconnectedVendor')}
              </AppText>
              {!name && <Badge variant="warning">{t('notOrderable')}</Badge>}
            </View>
            <AppText className="text-sm text-muted-foreground">
              {t('summary', { count: draft.intent.lines.length, countText: formatNumber(draft.intent.lines.length), units: formatNumber(units), location: locationName(draft.intent.deliveryLocationId) })}
            </AppText>
            {draft.intent.note ? <AppText className="text-sm text-foreground">{draft.intent.note}</AppText> : null}
            <AppText className="text-xs text-muted-foreground">{t('updated', { when: formatDateTime(draft.updatedAt) })}</AppText>
            <View className="flex-row flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={!name} onPress={() => void requestResume({ draft, then: 'cart' })}>
                {t('openInCart')}
              </Button>
              <Button size="sm" disabled={!name || draft.intent.lines.length === 0} onPress={() => void requestResume({ draft, then: 'checkout' })}>
                {t('reviewAndSubmit')}
              </Button>
              <Button size="sm" variant="ghost" accessibilityLabel={t('discardAria', { vendor: name ?? t('disconnectedVendor') })} onPress={() => setConfirm({ kind: 'discard', draft })}>
                {t('discard')}
              </Button>
            </View>
          </View>
        );
      }}
      ListEmptyComponent={<EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />}
      refreshControl={<RefreshControl refreshing={drafts.isRefetching} onRefresh={() => void drafts.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}
