import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  formatDate,
  formatNumber,
  isApiError,
  isOrgAdmin,
  pendingPlanRequest,
  planChangeWarnings,
  planNameMsg,
  usageMsg,
  type PlanRequest,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { SectionTitle } from '@/features/stats/parts';
import { useMsg, useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import { useAvailablePlans, usePlanRequests, useRequestPlanChange, useVendorPlan, useWithdrawPlanRequest } from './queries';

const REQUEST_BADGE: Record<PlanRequest['state'], 'info' | 'success' | 'secondary' | 'destructive'> = {
  PENDING: 'info',
  APPROVED: 'success',
  REJECTED: 'destructive',
  WITHDRAWN: 'secondary',
  SUPERSEDED: 'secondary',
};

/** Vendor plan on mobile — mirrors web: limits/usage, available plans, change requests (owner/admin). */
export function PlanScreen() {
  const t = useT('plan');
  const tmo = useT('mPlan');
  const tm = useMsg();
  const session = useBusiness();
  const admin = isOrgAdmin(session);
  const plan = useVendorPlan();
  const plans = useAvailablePlans(true);
  const requests = usePlanRequests(admin);
  const request = useRequestPlanChange();
  const withdraw = useWithdrawPlanRequest();
  const [picked, setPicked] = useState<string>();
  const [sent, setSent] = useState(false);

  const retry = () => void Promise.all([plan.refetch(), plans.refetch(), admin ? requests.refetch() : undefined]);
  if (plan.isError) {
    return isApiError(plan.error, 'PLAN_REQUIRED') ? (
      <View className="flex-1 gap-1 bg-background p-4">
        <AppText weight="medium" className="text-base text-foreground">
          {t('noPlanTitle')}
        </AppText>
        <AppText className="text-sm text-muted-foreground">{t('noPlanDescription')}</AppText>
      </View>
    ) : (
      <ErrorState error={plan.error} onRetry={retry} />
    );
  }
  if (plans.isError) return <ErrorState error={plans.error} onRetry={retry} />;
  if (plan.isPending || plans.isPending || (admin && requests.isPending)) return <LoadingState />;
  const current = plan.data;
  const byId = new Map(plans.data.map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = byId.get(id);
    return p ? tm(planNameMsg(p)) : '—';
  };
  const pending = pendingPlanRequest(requests.data);
  const target = plans.data.find((p) => p.id === picked);
  const warnings = target ? planChangeWarnings(current, target) : [];

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4 pb-12">
      <Stack.Screen options={{ title: t('title') }} />
      <View className="gap-1">
        <AppText weight="semibold" className="text-lg text-foreground">
          {t('currentTitle', { plan: tm(planNameMsg(current.plan)) })}
        </AppText>
        <AppText className="text-sm text-muted-foreground">{tm(usageMsg(current, 'products'))}</AppText>
        <AppText className="text-sm text-muted-foreground">{tm(usageMsg(current, 'buyers'))}</AppText>
        <AppText className="text-xs text-muted-foreground">{t('buyersNote')}</AppText>
      </View>

      {pending && (
        <View accessibilityRole="alert" className="gap-2 rounded-lg border border-border bg-card p-4">
          <AppText weight="medium" className="text-sm text-foreground">
            {t('pendingTitle', { plan: nameOf(pending.requestedPlanRevisionId) })}
          </AppText>
          <AppText className="text-sm text-muted-foreground">{t('pendingDescription', { date: formatDate(pending.createdAt) })}</AppText>
          <FormError error={withdraw.error} />
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            loading={withdraw.isPending}
            onPress={() => withdraw.mutate({ requestId: pending.id, expectedRevision: pending.revision })}>
            {t('withdraw')}
          </Button>
        </View>
      )}

      <View className="gap-3">
        <SectionTitle>{t('plans')}</SectionTitle>
        <View className="gap-2" accessibilityRole={admin ? 'radiogroup' : undefined}>
          {plans.data
            .filter((p) => !p.retired || p.id === current.plan.id)
            .map((p) => {
              const isCurrent = p.id === current.plan.id;
              const selectable = admin && !isCurrent && !pending;
              const on = p.id === picked;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole={selectable ? 'radio' : undefined}
                  aria-checked={selectable ? on : undefined}
                  disabled={!selectable}
                  onPress={() => {
                    setSent(false);
                    request.reset();
                    setPicked(p.id);
                  }}
                  className={`gap-0.5 rounded-lg border p-3 ${on ? 'border-primary bg-primary-subtle/40' : 'border-border bg-background'}`}>
                  <View className="flex-row items-center justify-between gap-2">
                    <AppText weight="medium" className="text-sm text-foreground">
                      {tm(planNameMsg(p))}
                    </AppText>
                    {isCurrent && <Badge variant="secondary">{t('current')}</Badge>}
                  </View>
                  <AppText className="text-sm text-muted-foreground">
                    {`${t('limitProductsShort', { count: p.productLimit, countText: formatNumber(p.productLimit) })} · ${t('limitBuyersShort', { count: p.activeBuyerLimit, countText: formatNumber(p.activeBuyerLimit) })}`}
                  </AppText>
                </Pressable>
              );
            })}
        </View>
        {warnings.length > 0 && <AppText className="text-sm text-destructive">{[t('overTitle') + '.', ...warnings.map(tm), t('overNote')].join(' ')}</AppText>}
        {admin && !pending && (
          <>
            <FormError error={request.error} />
            <Button
              loading={request.isPending}
              disabled={!picked}
              onPress={() =>
                picked &&
                request.mutate(picked, {
                  onSuccess: () => {
                    setSent(true);
                    setPicked(undefined);
                  },
                })
              }>
              {t('send')}
            </Button>
          </>
        )}
        {sent && (
          <AppText accessibilityRole="alert" className="text-sm text-success">
            {tmo('sent')}
          </AppText>
        )}
      </View>

      {admin ? (
        <View className="gap-3">
          <SectionTitle>{t('requests')}</SectionTitle>
          <View className="overflow-hidden rounded-xl border border-border">
            {(requests.data ?? []).length === 0 ? (
              <AppText className="p-4 text-sm text-muted-foreground">{t('noRequests')}</AppText>
            ) : (
              requests.data!.map((r, i) => (
                <View key={r.id}>
                  {i > 0 && <View className="h-px bg-border" />}
                  <View className="gap-1 bg-background p-3">
                    <View className="flex-row items-center justify-between gap-3">
                      <AppText weight="medium" className="text-sm text-foreground">
                        {nameOf(r.requestedPlanRevisionId)}
                      </AppText>
                      <Badge variant={REQUEST_BADGE[r.state]}>{t(`requestState.${r.state}`)}</Badge>
                    </View>
                    <AppText className="text-xs text-muted-foreground">{tmo('sentOn', { date: formatDate(r.createdAt) })}</AppText>
                    {r.resolutionReason ? <AppText className="text-sm text-muted-foreground">{r.resolutionReason}</AppText> : null}
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      ) : (
        <AppText className="text-sm text-muted-foreground">{t('staffNote')}</AppText>
      )}

      <AppText className="text-sm text-muted-foreground">{t('billingDescription')}</AppText>
    </ScrollView>
  );
}
