import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  formatDate,
  formatMoney,
  formatNumber,
  pendingRequest,
  planChangeProblems,
  services,
  UPGRADE_REQUEST_STATUS_KEY,
  usageLine,
  type TierUpgradeRequest,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { SectionTitle } from '@/features/stats/parts';
import { useRequestUpgrade, useUpgradeRequests, useVendorPlan } from '@/features/vendor-catalogue/queries';
import { useSignedIn } from '@/lib/session';
import { useMsg, useT } from '@/lib/i18n';

const REQUEST_BADGE: Record<TierUpgradeRequest['status'], 'info' | 'success' | 'secondary'> = {
  pending: 'info',
  fulfilled: 'success',
  dismissed: 'secondary',
};

/**
 * Subscription & billing on mobile — mirrors web's Plan & billing. v1.1: vendors request a
 * plan (tier + note); only the Platform Admin applies it (01 §2). Shows request history.
 */
export default function PlanScreen() {
  const t = useT('settings.plan');
  const tp = useT('planText');
  const tmo = useT('m.plan');
  const tmc = useT('m.common');
  const tvb = useT('vendorBuyers');
  const tm = useMsg();
  const { membership } = useSignedIn();
  const vendorOrgId = membership.org.id;
  const plan = useVendorPlan(vendorOrgId);
  const tiers = useQuery({ queryKey: ['subscriptionTiers'], queryFn: () => services.subscription.listTiers() });
  const requests = useUpgradeRequests(vendorOrgId);
  const request = useRequestUpgrade(vendorOrgId);
  const [picked, setPicked] = useState<string>();
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const retry = () => void Promise.all([plan.refetch(), tiers.refetch(), requests.refetch()]);
  if (plan.isError) return <ErrorState error={plan.error} onRetry={retry} />;
  if (tiers.isError) return <ErrorState error={tiers.error} onRetry={retry} />;
  if (requests.isError) return <ErrorState error={requests.error} onRetry={retry} />;
  if (plan.isPending || tiers.isPending || requests.isPending) return <LoadingState label={tmc('loadingPlans')} />;
  const p = plan.data;
  const pending = pendingRequest(requests.data);
  const tierName = (id: string | undefined) => tiers.data.find((tier) => tier.id === id)?.name ?? '—';
  const target = tiers.data.find((tier) => tier.id === picked);
  const warnings = target ? planChangeProblems(p, target) : [];

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4 pb-12" keyboardShouldPersistTaps="handled">
      <View className="gap-1">
        <AppText weight="semibold" className="text-lg text-foreground">
          {tp('perMonth', { plan: p.tier.name, price: formatMoney(p.tier.priceMonthly) })}
        </AppText>
        <AppText className="text-sm text-muted-foreground">{tm(usageLine(p, 'products'))}</AppText>
        <AppText className="text-sm text-muted-foreground">{tvb('usage', { line: tm(usageLine(p, 'buyers')) })}</AppText>
      </View>

      {pending ? (
        <View accessibilityRole="alert" className="gap-1 rounded-lg border border-border bg-card p-4">
          <AppText weight="medium" className="text-sm text-foreground">
            {t('pendingTitle', { plan: tierName(pending.requestedTierId) })}
          </AppText>
          <AppText className="text-sm text-muted-foreground">
            {tmo('pendingDescription', { date: formatDate(pending.createdAt) })}
          </AppText>
        </View>
      ) : (
        <View className="gap-3">
          <SectionTitle>{tmo('requestPlan')}</SectionTitle>
          <View className="gap-2" accessibilityRole="radiogroup">
            {tiers.data
              .filter((tier) => tier.id !== p.tier.id)
              .map((tier) => {
                const on = tier.id === picked;
                return (
                  <Pressable
                    key={tier.id}
                    accessibilityRole="radio"
                    aria-checked={on}
                    onPress={() => {
                      setSent(false);
                      request.reset();
                      setPicked(tier.id);
                    }}
                    className={`flex-row items-center gap-3 rounded-lg border p-3 ${on ? 'border-primary bg-primary-subtle/40' : 'border-border bg-background'}`}>
                    <View className="flex-1 gap-0.5">
                      <AppText weight="medium" className="text-sm text-foreground">
                        {tp('perMonth', { plan: tier.name, price: formatMoney(tier.priceMonthly) })}
                      </AppText>
                      <AppText className="text-sm text-muted-foreground">
                        {tp('limits', { products: formatNumber(tier.maxProducts), buyers: formatNumber(tier.maxBuyers) })}
                      </AppText>
                    </View>
                    <View className={`size-5 items-center justify-center rounded-full border ${on ? 'border-primary' : 'border-input'}`}>
                      {on && <View className="size-2.5 rounded-full bg-primary" />}
                    </View>
                  </Pressable>
                );
              })}
          </View>
          {warnings.length > 0 && (
            <AppText className="text-sm text-destructive">{[t('overTitle') + '.', ...warnings.map(tm)].join(' ')}</AppText>
          )}
          <Field label={t('noteLabel')} description={t('noteHint')}>
            <Input value={note} onChangeText={setNote} multiline className="h-20 py-2" accessibilityLabel={t('note')} />
          </Field>
          <FormError error={request.error} />
          <Button
            loading={request.isPending}
            disabled={!picked}
            onPress={() =>
              picked &&
              request.mutate(
                { tierId: picked, message: note },
                {
                  onSuccess: () => {
                    setSent(true);
                    setPicked(undefined);
                    setNote('');
                  },
                },
              )
            }>
            {t('send')}
          </Button>
        </View>
      )}
      {sent && (
        <AppText accessibilityRole="alert" className="text-sm text-success">
          {tmo('sent')}
        </AppText>
      )}

      <View className="gap-3">
        <SectionTitle>{t('requests')}</SectionTitle>
        <View className="overflow-hidden rounded-xl border border-border">
          {requests.data.length === 0 ? (
            <AppText className="p-4 text-sm text-muted-foreground">{t('noRequests')}</AppText>
          ) : (
            requests.data.map((r, i) => (
              <View key={r.id}>
                {i > 0 && <View className="h-px bg-border" />}
                <View className="gap-1 bg-background p-3">
                  <View className="flex-row items-center justify-between gap-3">
                    <AppText weight="medium" className="text-sm text-foreground">
                      {tierName(r.requestedTierId)}
                    </AppText>
                    <Badge variant={REQUEST_BADGE[r.status]}>{tm({ key: UPGRADE_REQUEST_STATUS_KEY[r.status] })}</Badge>
                  </View>
                  <AppText className="text-xs text-muted-foreground">
                    {`${tmo('sentOn', { date: formatDate(r.createdAt) })}${r.appliedTierId && r.appliedTierId !== r.requestedTierId ? ` · ${t('movedTo', { plan: tierName(r.appliedTierId) })}` : ''}`}
                  </AppText>
                  {r.message ? <AppText className="text-sm text-muted-foreground">{r.message}</AppText> : null}
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      <AppText className="text-sm text-muted-foreground">{t('billingDescription')}</AppText>
    </ScrollView>
  );
}
