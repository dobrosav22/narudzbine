import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney, formatNumber, type Invite, invitePath, isAtLimit, isServiceError, usageLine, USE_MOCKS } from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { FormError } from '@/components/ui/form-error';
import { PlanLimitNotice } from '@/features/subscription/plan-limit';
import { useVendorPlan } from '@/features/vendor-catalogue/queries';
import { useTokenColors } from '@/theme';
import { useBuyerRows, useInviteBuyer } from './queries';
import { useErrorText, useMsg, useT } from '@/lib/i18n';

/** 03 → vendor "Buyers" on mobile: connections, pending invites, invite form (plan limit aware — 01 §2). */
export function BuyersScreen({ vendorOrgId }: { vendorOrgId: string }) {
  const c = useTokenColors();
  const t = useT('vendorBuyers');
  const tmo = useT('m.buyers');
  const tc = useT('catalogue');
  const tm = useMsg();
  const rows = useBuyerRows(vendorOrgId);
  const usage = useVendorPlan(vendorOrgId);

  if (rows.isError) return <ErrorState error={rows.error} onRetry={() => void rows.refetch()} />;
  if (rows.isPending) return <LoadingState label={tmo('loading')} />;

  return (
    <FlatList
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      keyboardShouldPersistTaps="handled"
      data={rows.data}
      keyExtractor={(r) => r.buyerOrg?.id ?? r.invite?.id ?? r.name}
      ListHeaderComponent={
        <View className="gap-3 p-4">
          <AppText className="text-sm text-muted-foreground">
            {usage.data ? t('usage', { line: tm(usageLine(usage.data, 'buyers')) }) : ' '}
          </AppText>
          <InviteForm vendorOrgId={vendorOrgId} />
        </View>
      }
      renderItem={({ item: r }) => (
        <Pressable
          accessibilityRole={r.buyerOrg ? 'link' : undefined}
          accessibilityLabel={r.buyerOrg ? tc('open', { product: r.name }) : undefined}
          disabled={!r.buyerOrg}
          onPress={() => r.buyerOrg && router.push({ pathname: '/vendor/buyer/[id]', params: { id: r.buyerOrg.id } })}
          className="gap-1.5 px-4 py-3 active:bg-muted">
          <View className="flex-row items-center justify-between gap-3">
            <AppText weight="medium" mono={!r.buyerOrg} className="flex-1 text-base text-foreground" numberOfLines={1}>
              {r.name}
            </AppText>
            {r.kind === 'connected' ? <Badge variant="success">{t('connected')}</Badge> : <Badge variant="info">{t('inviteSent')}</Badge>}
          </View>
          {r.stats && (
            <AppText className="text-sm text-muted-foreground">
              {`${tmo('orders', { count: r.stats.orderCount, countText: formatNumber(r.stats.orderCount) })} · ${formatMoney(r.stats.spend)}`}
            </AppText>
          )}
          {USE_MOCKS && !r.buyerOrg && r.invite && <InviteLinkText invite={r.invite} />}
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={<EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />}
      refreshControl={<RefreshControl refreshing={rows.isRefetching} onRefresh={() => void rows.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}

function InviteForm({ vendorOrgId }: { vendorOrgId: string }) {
  const t = useT('vendorBuyers.invite');
  const tmo = useT('m.buyers');
  const errorText = useErrorText();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<Invite>();
  const invite = useInviteBuyer(vendorOrgId);
  const usage = useVendorPlan(vendorOrgId);
  // v1.1 hard block: usage is checked first; at or over maxBuyers the form is disabled outright.
  const blocked = !usage.data || isAtLimit(usage.data, 'buyers');
  const planLimit = isServiceError(invite.error, 'PLAN_LIMIT');
  const fieldError = isServiceError(invite.error, 'VALIDATION') || isServiceError(invite.error, 'CONFLICT') ? errorText(invite.error) : undefined;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Field label={tmo('inviteLabel')}>
        <Input
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setSent(undefined);
            if (invite.error) invite.reset();
          }}
          placeholder="purchasing@company.ba"
          autoCapitalize="none"
          keyboardType="email-address"
          accessibilityLabel={t('email')}
          editable={!blocked}
        />
        <FieldError>{fieldError}</FieldError>
      </Field>
      {(planLimit || (usage.data && blocked)) && usage.data && <PlanLimitNotice plan={usage.data} limit="buyers" />}
      {invite.error && !planLimit && !fieldError ? <FormError error={invite.error} /> : null}
      <Button
        loading={invite.isPending}
        disabled={!email || blocked}
        onPress={() =>
          invite.mutate(email, {
            onSuccess: (i) => {
              setSent(i);
              setEmail('');
            },
          })
        }>
        {t('send')}
      </Button>
      {sent && (
        <View accessibilityRole="alert" className="gap-1">
          <AppText className="text-sm text-success">{tmo('invited', { email: sent.email })}</AppText>
          {USE_MOCKS && <InviteLinkText invite={sent} />}
        </View>
      )}
    </View>
  );
}

/** [assumed] Mock-only: no email is sent, so show the path that would be emailed (deep link narudzbine://invite/…). */
function InviteLinkText({ invite }: { invite: Pick<Invite, 'token'> }) {
  const tmo = useT('m.buyers');
  return (
    <AppText mono selectable className="text-xs text-muted-foreground">
      {tmo('inviteLink', { path: invitePath(invite) })}
    </AppText>
  );
}
