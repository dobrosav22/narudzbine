import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { applyReorder, canSubmitOrCancel, formatNumber, orderActions, orderQueries, reorderPlan, type Order, type OrderViewer, type ReorderPreview } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { cartStore } from '@/lib/cart';
import { sessionStore, useBusiness } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { ActionError, ActionPanel } from './action-panel';
import { useCancelOrder, useRequestCancellation } from './queries';

type Action = 'cancel' | 'request' | 'reorder' | 'replace' | null;

/**
 * Buyer controls on mobile (mirrors web): cancel before acceptance, request cancellation after,
 * reorder (read-only preview → local cart) and a replacement for a cancelled order (cart carries
 * replacementForOrderId into checkout's review intent).
 */
export function BuyerOrderActions({ order, viewer }: { order: Order; viewer: OrderViewer }) {
  const t = useT('orders.buyerActions');
  const tr = useT('orders.reorder');
  const actions = orderActions(order, viewer);
  const [action, setAction] = useState<Action>(null);
  const cancel = useCancelOrder();
  const request = useRequestCancellation();
  const ref = { orderId: order.id, expectedRevision: order.revision };
  const restricted = !canSubmitOrCancel(viewer) && (order.state === 'AWAITING_ACCEPTANCE' || order.state === 'ACCEPTED');
  const back = () => {
    setAction(null);
    cancel.reset();
    request.reset();
  };

  if (action === 'cancel') {
    return (
      <ActionPanel
        reason
        title={t('cancelTitle', { number: order.number })}
        description={t('cancelDescription', { vendor: order.vendor.displayName })}
        confirmLabel={t('cancel')}
        destructive
        pending={cancel.isPending}
        error={cancel.error}
        onBack={back}
        onConfirm={(reason) => cancel.mutate({ ...ref, reason }, { onSuccess: () => setAction(null) })}
      />
    );
  }
  if (action === 'request') {
    return (
      <ActionPanel
        reason
        title={t('requestTitle', { number: order.number })}
        description={t('requestDescription', { vendor: order.vendor.displayName })}
        confirmLabel={t('requestCancellation')}
        pending={request.isPending}
        error={request.error}
        onBack={back}
        onConfirm={(reason) => request.mutate({ ...ref, reason }, { onSuccess: () => setAction(null) })}
      />
    );
  }
  if (action === 'reorder' || action === 'replace') {
    return <ReorderPanel order={order} replacement={action === 'replace'} onBack={back} />;
  }
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {actions.replace && <Button onPress={() => setAction('replace')}>{tr('replacement')}</Button>}
        {actions.reorder && (
          <Button variant="outline" onPress={() => setAction('reorder')}>
            {tr('reorder')}
          </Button>
        )}
        {actions.requestCancellation && (
          <Button variant="outline" onPress={() => setAction('request')}>
            {t('requestCancellation')}
          </Button>
        )}
        {actions.cancel && (
          <Button variant="destructive" onPress={() => setAction('cancel')}>
            {t('cancel')}
          </Button>
        )}
      </View>
      {restricted && <AppText className="text-sm text-muted-foreground">{t('restricted')}</AppText>}
    </View>
  );
}

function ReorderPanel({ order, replacement, onBack }: { order: Order; replacement: boolean; onBack: () => void }) {
  const t = useT('orders.reorder');
  const { organization } = useBusiness();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<ReorderPreview | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const scope = { buyerOrgId: organization.id, vendorId: order.vendor.organizationId };

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      await cartStore.hydrate(scope);
      setPreview(await qc.fetchQuery(orderQueries.reorderPreview(order.id)));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const plan = reorderPlan(preview);
      const existing = cartStore.getState(scope).lines.length > 0;
      if (plan.lines.length > 0) applyReorder(cartStore, scope, plan, existing ? mode : 'replace');
      if (replacement) cartStore.updateDetails(scope, { replacementForOrderId: order.id });
      if (plan.lines.length > 0 || replacement) {
        await sessionStore.selectVendor(order.vendor.organizationId);
        router.navigate('/buyer/cart');
      }
      onBack();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (!preview) {
    return (
      <ActionPanel
        title={replacement ? t('replacementTitle', { number: order.number }) : t('title', { number: order.number })}
        description={replacement ? t('replacementDescription') : t('description')}
        confirmLabel={replacement ? t('replacement') : t('reorder')}
        pending={busy}
        error={error}
        onBack={onBack}
        onConfirm={() => void load()}
      />
    );
  }
  const orderable = preview.lines.filter((l) => l.currentOffer !== null).length;
  const existing = cartStore.getState(scope).lines.length;
  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-3">
      {preview.lines.map((l, i) => (
        <View key={`${l.original.productId}-${i}`} className="flex-row justify-between gap-2">
          <View className="flex-1">
            <AppText className="text-sm text-foreground">{`${formatNumber(l.original.quantity)} × ${l.original.name}`}</AppText>
            {l.changes.filter((c) => c !== 'UNAVAILABLE').length > 0 && (
              <AppText className="text-xs text-muted-foreground">
                {l.changes
                  .filter((c) => c !== 'UNAVAILABLE')
                  .map((c) => t(`change.${c as Exclude<typeof c, 'UNAVAILABLE'>}`))
                  .join(' · ')}
              </AppText>
            )}
          </View>
          <AppText className={`text-xs ${l.currentOffer === null ? 'text-destructive' : l.available ? 'text-success' : 'text-muted-foreground'}`}>
            {l.currentOffer === null ? t('unavailable') : l.available ? t('available') : t('check')}
          </AppText>
        </View>
      ))}
      {orderable === 0 && <AppText className="text-sm text-muted-foreground">{t('nothingAvailable')}</AppText>}
      {existing > 0 && orderable > 0 && (
        <View className="gap-2">
          <AppText className="text-sm text-foreground">{t('existingCart', { count: existing, countText: formatNumber(existing) })}</AppText>
          <View className="flex-row flex-wrap gap-2">
            <Chip role="radio" label={t('merge')} selected={mode === 'merge'} onPress={() => setMode('merge')} />
            <Chip role="radio" label={t('replace')} selected={mode === 'replace'} onPress={() => setMode('replace')} />
          </View>
        </View>
      )}
      <ActionError error={error} />
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" onPress={onBack}>
          {t('close')}
        </Button>
        <Button size="sm" loading={busy} disabled={orderable === 0 && !replacement} onPress={() => void confirm()}>
          {t('toCart')}
        </Button>
      </View>
    </View>
  );
}
