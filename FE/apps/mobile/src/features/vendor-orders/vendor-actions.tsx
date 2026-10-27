import { useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { canConfigureStages, orderActions, sortedStages, type Order, type Role } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { useT } from '@/lib/i18n';
import { ActionError, ActionPanel } from '@/features/orders/action-panel';
import {
  useAcceptOrder,
  useCancelOrder,
  useDeliverOrder,
  useDispatchOrder,
  useFulfillmentLocations,
  useOrderStages,
  useRejectOrder,
  useSetOrderStage,
} from '@/features/orders/queries';

type Action = 'accept' | 'reject' | 'cancel' | 'dispatch' | 'deliver' | null;

/** Vendor lifecycle controls on mobile for the current core state (mirrors web VendorOrderActions). */
export function VendorOrderActions({ order, role }: { order: Order; role: Role | null }) {
  const t = useT('vendorOrders');
  const actions = orderActions(order, { side: 'VENDOR', role, staffSubmissionRestricted: false });
  const [action, setAction] = useState<Action>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const accept = useAcceptOrder();
  const reject = useRejectOrder();
  const cancel = useCancelOrder();
  const dispatch = useDispatchOrder();
  const deliver = useDeliverOrder();
  const setStage = useSetOrderStage();
  const locations = useFulfillmentLocations(action === 'accept');
  const stages = useOrderStages(actions.setStage);
  const ref = { orderId: order.id, expectedRevision: order.revision };
  if (!(actions.accept || actions.setStage || actions.dispatch || actions.deliver || actions.cancel)) return null;

  const back = () => {
    setAction(null);
    for (const m of [accept, reject, cancel, dispatch, deliver]) m.reset();
  };
  const done = { onSuccess: () => setAction(null) };
  const active = stages.data ? sortedStages(stages.data).filter((s) => s.state === 'ACTIVE') : [];

  let panel: React.ReactNode = null;
  if (action === 'accept') {
    panel = (
      <ActionPanel
        title={t('acceptTitle', { number: order.number })}
        description={t('acceptDescription', { buyer: order.buyer.displayName })}
        confirmLabel={t('accept')}
        pending={accept.isPending}
        error={accept.error ?? locations.error}
        onBack={back}
        onConfirm={() => accept.mutate({ ...ref, fulfillmentLocationId: locationId }, done)}>
        <View className="gap-2">
          <AppText weight="medium" className="text-sm text-foreground">
            {t('fulfillmentLocation')}
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            <Chip role="radio" label={t('noFulfillmentLocation')} selected={locationId === null} onPress={() => setLocationId(null)} />
            {locations.data?.map((l) => (
              <Chip key={l.id} role="radio" label={l.name} selected={locationId === l.id} onPress={() => setLocationId(l.id)} />
            ))}
          </View>
          <AppText className="text-xs text-muted-foreground">{t('fulfillmentHint')}</AppText>
        </View>
      </ActionPanel>
    );
  } else if (action === 'reject') {
    panel = (
      <ActionPanel
        reason
        destructive
        title={t('rejectTitle', { number: order.number })}
        description={t('rejectDescription', { buyer: order.buyer.displayName })}
        confirmLabel={t('reject')}
        pending={reject.isPending}
        error={reject.error}
        onBack={back}
        onConfirm={(reason) => reject.mutate({ ...ref, reason }, done)}
      />
    );
  } else if (action === 'cancel') {
    panel = (
      <ActionPanel
        reason
        destructive
        title={t('cancelTitle', { number: order.number })}
        description={order.cancellationRequestId ? t('cancelDescriptionPending') : t('cancelDescription', { buyer: order.buyer.displayName })}
        confirmLabel={t('cancel')}
        pending={cancel.isPending}
        error={cancel.error}
        onBack={back}
        onConfirm={(reason) => cancel.mutate({ ...ref, reason }, done)}
      />
    );
  } else if (action === 'dispatch') {
    panel = (
      <ActionPanel
        title={t('dispatchTitle', { number: order.number })}
        description={t('dispatchDescription')}
        confirmLabel={t('dispatch')}
        pending={dispatch.isPending}
        error={dispatch.error}
        onBack={back}
        onConfirm={() => dispatch.mutate(ref, done)}
      />
    );
  } else if (action === 'deliver') {
    panel = (
      <ActionPanel
        title={t('deliverTitle', { number: order.number })}
        description={t('deliverDescription')}
        confirmLabel={t('deliver')}
        pending={deliver.isPending}
        error={deliver.error}
        onBack={back}
        onConfirm={() => deliver.mutate(ref, done)}
      />
    );
  }

  return (
    <Card>
      <CardHeader title={t('actionsTitle')} description={t('actionsDescription')} />
      {actions.setStage && (
        <View className="gap-2">
          <AppText weight="medium" className="text-sm text-foreground">
            {t('stage')}
          </AppText>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            <Chip
              role="radio"
              label={t('noStage')}
              selected={order.stageId === null}
              onPress={() => order.stageId !== null && !setStage.isPending && setStage.mutate({ ...ref, stageId: null })}
            />
            {active.map((s) => (
              <Chip
                key={s.id}
                role="radio"
                label={s.name}
                selected={order.stageId === s.id}
                onPress={() => order.stageId !== s.id && !setStage.isPending && setStage.mutate({ ...ref, stageId: s.id })}
              />
            ))}
          </View>
          {stages.data && active.length === 0 && <AppText className="text-xs text-muted-foreground">{t('noStagesConfigured')}</AppText>}
          {canConfigureStages(role) && (
            <Button size="sm" variant="ghost" className="self-start" onPress={() => router.push('/vendor/stages' as Href) /* typed routes regenerate on the next expo start */}>
              {t('manageStages')}
            </Button>
          )}
          <ActionError error={setStage.error} />
        </View>
      )}
      {panel ?? (
        <View className="gap-2">
          {actions.accept && <Button onPress={() => setAction('accept')}>{t('accept')}</Button>}
          {actions.reject && (
            <Button variant="outline" onPress={() => setAction('reject')}>
              {t('reject')}
            </Button>
          )}
          {order.state === 'ACCEPTED' && (
            <Button disabled={!actions.dispatch} onPress={() => setAction('dispatch')}>
              {t('dispatch')}
            </Button>
          )}
          {order.state === 'ACCEPTED' && !actions.dispatch && <AppText className="text-sm text-muted-foreground">{t('dispatchBlocked')}</AppText>}
          {actions.deliver && <Button onPress={() => setAction('deliver')}>{t('deliver')}</Button>}
          {actions.cancel && (
            <Button variant="destructive" onPress={() => setAction('cancel')}>
              {t('cancel')}
            </Button>
          )}
        </View>
      )}
    </Card>
  );
}
