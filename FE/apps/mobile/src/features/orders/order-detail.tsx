import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, Stack, type Href } from 'expo-router';
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  isApiError,
  isTerminalOrderState,
  orderActions,
  orderPartner,
  type Address,
  type Order,
  type OrderViewer,
  type ReviewedLine,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useBusiness } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { ActionError, ActionPanel } from './action-panel';
import { OrderProgress } from './order-progress';
import { OrderThread } from './order-thread';
import { OrderTimeline } from './order-timeline';
import { useApproveCancellation, useCancellationRequest, useOrder, useOrderPartners, useRejectCancellation, useWithdrawCancellation } from './queries';
import { OrderStateBadge } from './state-badge';

/** Loads one order for either side; `actions` renders the side's lifecycle controls (mirrors web). */
export function OrderDetailLoader({
  orderId,
  placed,
  actions,
}: {
  orderId: string;
  placed?: boolean;
  actions: (order: Order, viewer: OrderViewer) => React.ReactNode;
}) {
  const t = useT('orders');
  const tmo = useT('mOrders');
  const order = useOrder(orderId);
  if (order.isError) {
    return isApiError(order.error, 'NOT_FOUND') ? (
      <EmptyState title={t('notFoundTitle')} description={t('notFoundDescription')} />
    ) : (
      <ErrorState error={order.error} onRetry={() => void order.refetch()} />
    );
  }
  if (order.isPending) return <LoadingState label={tmo('loadingOne')} />;
  return <OrderDetail order={order.data} placed={placed} actions={actions} />;
}

function OrderDetail({ order, placed, actions }: { order: Order; placed?: boolean; actions: (order: Order, viewer: OrderViewer) => React.ReactNode }) {
  const t = useT('orders');
  const tmo = useT('mOrders');
  const { account, organization } = useBusiness();
  const side = organization.type === 'BUYER' ? 'BUYER' : 'VENDOR';
  const viewer: OrderViewer = { side, role: account.role, staffSubmissionRestricted: organization.staffSubmissionRestricted };
  const partner = orderPartner(order, side);
  const partners = useOrderPartners();
  const partnerRecord = partners.data?.find((p) => p.id === partner.organizationId);
  const readOnlyThread = partnerRecord?.relationshipState === 'DISCONNECTED' && isTerminalOrderState(order.state);
  const detailPath = side === 'BUYER' ? '/buyer/order/[id]' : '/vendor/order/[id]';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background">
      <Stack.Screen options={{ title: tmo('orderAria', { number: order.number }) }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12" keyboardShouldPersistTaps="handled">
        {placed && (
          <View accessibilityRole="alert" className="gap-1 rounded-lg border border-border bg-card p-3">
            <AppText weight="medium" className="text-sm text-success">
              {t('placedTitle')}
            </AppText>
            <AppText className="text-sm text-muted-foreground">{t('placedDescription', { vendor: order.vendor.displayName })}</AppText>
          </View>
        )}
        <View className="gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <AppText mono weight="semibold" className="text-xl text-foreground">
              {order.number}
            </AppText>
            <OrderStateBadge state={order.state} stageName={order.stageName} />
          </View>
          <AppText className="text-sm text-muted-foreground">
            {order.submittedByDisplayName
              ? t('submittedAtBy', { partner: partner.displayName, when: formatDateTime(order.submittedAt), name: order.submittedByDisplayName })
              : t('submittedAt', { partner: partner.displayName, when: formatDateTime(order.submittedAt) })}
          </AppText>
          {order.replacementForOrderId && <ReplacementLink orderId={order.replacementForOrderId} path={detailPath} />}
        </View>

        <OrderProgress state={order.state} stageName={order.stageName} endedNote={order.state === 'REJECTED' ? t('rejectedNote') : t('cancelledNote')} />
        <CancellationRequestPanel order={order} viewer={viewer} />
        {actions(order, viewer)}

        <Card>
          <CardHeader title={t('items')} description={t('asSubmitted')} />
          {order.lines.map((line, i) => (
            <LineRow key={`${line.productId}-${i}`} line={line} currency={order.currency} />
          ))}
          <View className="h-px bg-border" />
          <View className="flex-row justify-between">
            <AppText weight="semibold" className="text-base text-foreground">
              {t('goodsTotal')}
            </AppText>
            <AppText mono weight="semibold" className="text-base text-foreground">
              {formatMoney(order.goodsTotal, order.currency)}
            </AppText>
          </View>
          <AppText className="text-xs text-muted-foreground">{t('netNote')}</AppText>
        </Card>

        <Card>
          <CardHeader title={side === 'BUYER' ? t('vendor') : t('buyer')} />
          {partnerRecord ? (
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                side === 'BUYER'
                  ? // Buyer stack vendor/[id] (agent D2); typed routes regenerate on the next expo start.
                  router.push({ pathname: '/buyer/vendor/[id]', params: { id: partnerRecord.relationshipId } } as unknown as Href)
                  : router.push({ pathname: '/vendor/buyer/[id]', params: { id: partnerRecord.relationshipId } })
              }>
              <AppText weight="medium" className="text-sm text-primary">
                {partner.displayName}
              </AppText>
            </Pressable>
          ) : (
            <AppText weight="medium" className="text-sm text-foreground">
              {partner.displayName}
            </AppText>
          )}
          <AppText className="text-sm text-muted-foreground">{t('registration', { id: partner.registrationIdentifier })}</AppText>
          {partner.taxIdentifier ? <AppText className="text-sm text-muted-foreground">{t('taxId', { id: partner.taxIdentifier })}</AppText> : null}
        </Card>

        <Card>
          <CardHeader title={t('delivery')} />
          <AddressText address={order.deliveryAddress} />
          <View>
            <AppText className="text-xs text-muted-foreground">{t('contact')}</AppText>
            <AppText className="text-sm text-foreground">{`${order.deliveryContact.name} · ${order.deliveryContact.phone}`}</AppText>
            {order.deliveryContact.email ? <AppText className="text-sm text-muted-foreground">{order.deliveryContact.email}</AppText> : null}
          </View>
          {order.deliveryInstructions ? (
            <View>
              <AppText className="text-xs text-muted-foreground">{t('instructions')}</AppText>
              <AppText className="text-sm text-foreground">{order.deliveryInstructions}</AppText>
            </View>
          ) : null}
          {order.fulfillmentLocation ? (
            <View>
              <AppText className="text-xs text-muted-foreground">{t('fulfilledFrom')}</AppText>
              <AppText className="text-sm text-foreground">{order.fulfillmentLocation.name}</AppText>
              <AddressText address={order.fulfillmentLocation.address} />
            </View>
          ) : null}
          {order.note ? (
            <View>
              <AppText className="text-xs text-muted-foreground">{t('note')}</AppText>
              <AppText className="text-sm text-foreground">{order.note}</AppText>
            </View>
          ) : null}
        </Card>

        <OrderTimeline order={order} ownOrganizationId={organization.id} />
        <OrderThread
          orderId={order.id}
          ownOrganizationId={organization.id}
          ownOrganizationName={organization.displayName}
          ownAccountId={account.id}
          counterpartName={partner.displayName}
          readOnly={readOnlyThread}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AddressText({ address }: { address: Address }) {
  return (
    <AppText className="text-sm text-muted-foreground">
      {[address.line1, address.line2, `${address.postalCode} ${address.city}`].filter(Boolean).join(', ')}
    </AppText>
  );
}

/** Frozen line with how its unit price was reached (agreed / promotion / volume tier). */
function LineRow({ line, currency }: { line: ReviewedLine; currency: Order['currency'] }) {
  const t = useT('orders');
  const p = line.price;
  const before = p.agreedUnitPrice ?? p.normalUnitPrice;
  return (
    <View className="gap-1">
      <View className="flex-row justify-between gap-3">
        <View className="flex-1">
          <AppText className="text-sm text-foreground" numberOfLines={2}>
            {`${formatNumber(line.quantity)} ${line.unitName} × ${line.name}`}
          </AppText>
          <AppText mono className="text-xs text-muted-foreground">
            {`${line.sku} · ${formatMoney(p.finalUnitPrice, currency)}`}
            {before !== p.finalUnitPrice ? ` (${formatMoney(before, currency)})` : ''}
          </AppText>
        </View>
        <AppText mono className="text-sm text-foreground">
          {formatMoney(p.lineTotal, currency)}
        </AppText>
      </View>
      {(p.agreedUnitPrice !== null || p.appliedPromotion || (p.reachedTierThreshold !== null && p.agreedUnitPrice === null)) && (
        <View className="flex-row flex-wrap gap-1">
          {p.agreedUnitPrice !== null && <Badge variant="info">{t('agreedPrice')}</Badge>}
          {p.appliedPromotion && <Badge variant="success">{p.appliedPromotion.name}</Badge>}
          {p.reachedTierThreshold !== null && p.agreedUnitPrice === null && (
            <Badge variant="secondary">{t('tierFrom', { quantity: formatNumber(p.reachedTierThreshold) })}</Badge>
          )}
        </View>
      )}
    </View>
  );
}

function ReplacementLink({ orderId, path }: { orderId: string; path: '/buyer/order/[id]' | '/vendor/order/[id]' }) {
  const tmo = useT('mOrders');
  const previous = useOrder(orderId);
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: path, params: { id: orderId } })}>
      <AppText className="text-sm text-primary">{tmo('replacementFor', { number: previous.data?.number ?? '…' })}</AppText>
    </Pressable>
  );
}

type RequestAction = 'approve' | 'decline' | 'withdraw' | null;

/** Pending cancellation request (request revision for resolution); mirrors web. */
function CancellationRequestPanel({ order, viewer }: { order: Order; viewer: OrderViewer }) {
  const t = useT('orders.request');
  const request = useCancellationRequest(order.id, order.cancellationRequestId);
  const withdraw = useWithdrawCancellation();
  const approve = useApproveCancellation();
  const decline = useRejectCancellation();
  const [action, setAction] = useState<RequestAction>(null);
  if (!order.cancellationRequestId) return null;
  if (request.isError) return <ActionError error={request.error} />;
  if (!request.data) return null;
  const r = request.data;
  const actions = orderActions(order, viewer);
  const ref = { orderId: order.id, requestId: r.id, expectedRevision: r.revision };
  const back = () => {
    setAction(null);
    withdraw.reset();
    approve.reset();
    decline.reset();
  };
  const done = { onSuccess: () => setAction(null) };

  return (
    <View accessibilityRole="alert" className="gap-2 rounded-lg border border-border bg-card p-3">
      <AppText weight="medium" className="text-sm text-foreground">
        {viewer.side === 'VENDOR' ? t('titleVendor', { buyer: order.buyer.displayName }) : t('titleBuyer')}
      </AppText>
      <AppText className="text-sm text-muted-foreground">{t('reason', { reason: r.reason, when: formatDateTime(r.createdAt) })}</AppText>
      <AppText className="text-sm text-muted-foreground">{viewer.side === 'VENDOR' ? t('vendorHint') : t('buyerHint')}</AppText>
      {action === 'approve' ? (
        <ActionPanel
          title={t('approveTitle', { number: order.number })}
          description={t('approveDescription')}
          confirmLabel={t('approve')}
          destructive
          pending={approve.isPending}
          error={approve.error}
          onBack={back}
          onConfirm={() => approve.mutate(ref, done)}
        />
      ) : action === 'decline' ? (
        <ActionPanel
          reason
          title={t('declineTitle')}
          description={t('declineDescription', { buyer: order.buyer.displayName })}
          confirmLabel={t('decline')}
          pending={decline.isPending}
          error={decline.error}
          onBack={back}
          onConfirm={(reason) => decline.mutate({ ...ref, reason }, done)}
        />
      ) : action === 'withdraw' ? (
        <ActionPanel
          title={t('withdrawTitle')}
          description={t('withdrawDescription', { vendor: order.vendor.displayName })}
          confirmLabel={t('withdraw')}
          pending={withdraw.isPending}
          error={withdraw.error}
          onBack={back}
          onConfirm={() => withdraw.mutate(ref, done)}
        />
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {actions.approveCancellation && (
            <Button size="sm" variant="destructive" onPress={() => setAction('approve')}>
              {t('approve')}
            </Button>
          )}
          {actions.rejectCancellation && (
            <Button size="sm" variant="outline" onPress={() => setAction('decline')}>
              {t('decline')}
            </Button>
          )}
          {actions.withdrawCancellation && (
            <Button size="sm" variant="outline" onPress={() => setAction('withdraw')}>
              {t('withdraw')}
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
