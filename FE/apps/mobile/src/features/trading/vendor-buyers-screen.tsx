import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  buyerInviteNeedsResend,
  fieldProblemMsg,
  formatDate,
  isApiError,
  isOrgAdmin,
  isUncertainOutcome,
  planAtLimit,
  usageMsg,
  uuidv4,
  type Invitation,
  type Relationship,
  type RelationshipState,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { FormError } from '@/components/ui/form-error';
import { PlanLimitNotice } from '@/features/subscription/plan-limit';
import { useVendorPlan } from '@/features/subscription/queries';
import { useErrorText, useMsg, useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { RelationshipStateBadge, usePartnerName } from './parts';
import { useBuyerInvitations, useInviteBuyer, useRelationshipPages, useResendInvitation, useRevokeInvitation } from './queries';

type View_ = RelationshipState | 'INVITATIONS';

/** Vendor → Buyers tab: connected / disconnected buyers, pending invitations, invite form. */
export function VendorBuyersScreen() {
  const c = useTokenColors();
  const t = useT('vendorBuyers');
  const tm = useMsg();
  const session = useBusiness();
  const admin = isOrgAdmin(session);
  const [view, setView] = useState<View_>('ACTIVE');
  const plan = useVendorPlan();
  const list = useRelationshipPages(view === 'INVITATIONS' ? 'ACTIVE' : view);

  const header = (
    <View className="gap-3 p-4">
      <AppText className="text-sm text-muted-foreground">{plan.data ? tm(usageMsg(plan.data, 'buyers')) : ' '}</AppText>
      {plan.data && planAtLimit(plan.data, 'buyers') && <PlanLimitNotice plan={plan.data} limit="buyers" />}
      {admin && <InviteForm buyerOrganizationId={null} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
        <Chip role="radio" label={t('tabs.active')} selected={view === 'ACTIVE'} onPress={() => setView('ACTIVE')} />
        <Chip role="radio" label={t('tabs.disconnected')} selected={view === 'DISCONNECTED'} onPress={() => setView('DISCONNECTED')} />
        {admin && <Chip role="radio" label={t('tabs.invitations')} selected={view === 'INVITATIONS'} onPress={() => setView('INVITATIONS')} />}
      </ScrollView>
    </View>
  );

  if (view === 'INVITATIONS') return <InvitationList header={header} />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  return (
    <FlatList<Relationship>
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      keyboardShouldPersistTaps="handled"
      data={list.data?.pages.flatMap((p) => p.items) ?? []}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <RelationshipRow relationship={item} />}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
      ListEmptyComponent={
        list.isPending ? (
          <LoadingState />
        ) : view === 'ACTIVE' ? (
          <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
        ) : (
          <EmptyState title={t('emptyDisconnectedTitle')} description={t('emptyDisconnectedDescription')} />
        )
      }
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}

function RelationshipRow({ relationship: r }: { relationship: Relationship }) {
  const t = useT('vendorBuyers');
  const name = usePartnerName(r.buyerId);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={name}
      onPress={() => router.push({ pathname: '/vendor/buyer/[id]', params: { id: r.id } })}
      className="gap-1.5 px-4 py-3 active:bg-muted">
      <View className="flex-row items-center justify-between gap-3">
        <AppText weight="medium" className="flex-1 text-base text-foreground" numberOfLines={1}>
          {name ?? '…'}
        </AppText>
        <RelationshipStateBadge state={r.state} />
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <AppText className="text-sm text-muted-foreground">
          {r.state === 'ACTIVE' ? t('since', { date: formatDate(r.createdAt) }) : t('disconnectedSince', { date: formatDate(r.updatedAt) })}
        </AppText>
        {r.agreedPriceConfirmationRequired && <Badge variant="warning">{t('reviewNeeded')}</Badge>}
      </View>
    </Pressable>
  );
}

/** New buyer (`buyerOrganizationId: null`) or reconnection of a formerly connected buyer. */
export function InviteForm({ buyerOrganizationId }: { buyerOrganizationId: string | null }) {
  const t = useT('vendorBuyers.invite');
  const errorText = useErrorText();
  const tm = useMsg();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<Invitation>();
  const invite = useInviteBuyer();
  const planProblem = isApiError(invite.error, 'PLAN_LIMIT_EXCEEDED') || isApiError(invite.error, 'PLAN_REQUIRED');
  const code = isApiError(invite.error) ? invite.error.fieldCode('recipientEmail') : undefined;
  const fieldMsg = code ? fieldProblemMsg(code) : undefined;
  const fieldError = isApiError(invite.error, 'ALREADY_CONNECTED') ? errorText(invite.error) : fieldMsg ? tm(fieldMsg) : undefined;

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <Field label={buyerOrganizationId ? t('reconnectLabel') : t('title')} description={t(buyerOrganizationId ? 'emailHintReconnect' : 'emailHint')}>
        <Input
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setSent(undefined);
            if (invite.error) invite.reset();
          }}
          autoCapitalize="none"
          autoComplete="off"
          keyboardType="email-address"
          maxLength={254}
          accessibilityLabel={t('email')}
        />
        <FieldError>{fieldError}</FieldError>
      </Field>
      {planProblem && <PlanLimitNotice limit="buyers" />}
      {invite.error && !planProblem && !fieldError ? <FormError error={invite.error} /> : null}
      <Button
        loading={invite.isPending}
        disabled={!email.trim()}
        onPress={() =>
          invite.mutate(
            { recipientEmail: email.trim(), buyerOrganizationId },
            {
              onSuccess: (i) => {
                setSent(i);
                setEmail('');
              },
            },
          )
        }>
        {t('send')}
      </Button>
      {sent && (
        <AppText accessibilityRole="alert" className="text-sm text-success">
          {t('sentDescription', { email: sent.recipientEmail })}
        </AppText>
      )}
    </View>
  );
}

function InvitationList({ header }: { header: React.ReactElement }) {
  const c = useTokenColors();
  const t = useT('vendorBuyers');
  const ti = useT('vendorBuyers.invitations');
  const errorText = useErrorText();
  const invitations = useBuyerInvitations('PENDING');
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Record<string, string>>({});

  const doResend = (inv: Invitation) => {
    const key = keys[inv.id] ?? uuidv4();
    setKeys((k) => ({ ...k, [inv.id]: key }));
    resend.mutateAsync({ invitationId: inv.id, expectedRevision: inv.revision, idempotencyKey: key }).then(
      () => {
        setKeys(({ [inv.id]: _, ...rest }) => rest);
        setNotice((n) => ({ ...n, [inv.id]: ti('resent', { email: inv.recipientEmail }) }));
      },
      (error: unknown) => {
        if (!isUncertainOutcome(error)) setKeys(({ [inv.id]: _, ...rest }) => rest);
        setNotice((n) => ({ ...n, [inv.id]: isUncertainOutcome(error) ? ti('resendUncertain') : errorText(error) }));
      },
    );
  };

  if (invitations.isError) return <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />;
  return (
    <FlatList<Invitation>
      className="flex-1 bg-background"
      contentContainerClassName="pb-8"
      keyboardShouldPersistTaps="handled"
      data={invitations.data ?? []}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={
        <>
          {header}
          <AppText className="px-4 pb-2 text-sm text-muted-foreground">{ti('note')}</AppText>
        </>
      }
      renderItem={({ item: inv }) => (
        <View className="gap-1.5 px-4 py-3">
          <AppText weight="medium" className="text-base text-foreground" selectable>
            {inv.recipientEmail}
          </AppText>
          <AppText className="text-sm text-muted-foreground">
            {`${inv.purpose === 'TRADING' ? ti('kindReconnect') : ti('kindNew')} · ${ti('sentOn', { date: formatDate(inv.createdAt) })}`}
          </AppText>
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge variant={inv.deliveryState === 'FAILED' ? 'destructive' : inv.deliveryState === 'DELIVERED' ? 'success' : 'secondary'}>
              {ti(`deliveryState.${inv.deliveryState}`)}
            </Badge>
            {buyerInviteNeedsResend(inv) && <AppText className="text-xs text-muted-foreground">{ti('needsResend')}</AppText>}
          </View>
          {notice[inv.id] && <AppText className="text-sm text-muted-foreground">{notice[inv.id]}</AppText>}
          <View className="flex-row gap-2">
            <Button size="sm" variant="outline" disabled={resend.isPending} onPress={() => doResend(inv)}>
              {keys[inv.id] ? ti('retryResend') : ti('resend')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onPress={() =>
                Alert.alert(ti('revokeTitle', { email: inv.recipientEmail }), ti('revokeDescription'), [
                  { text: t('keep'), style: 'cancel' },
                  {
                    text: ti('revoke'),
                    style: 'destructive',
                    onPress: () =>
                      void revoke.mutateAsync(inv.id).then(
                        () => setNotice((n) => ({ ...n, [inv.id]: ti('revoked', { email: inv.recipientEmail }) })),
                        (e: unknown) => setNotice((n) => ({ ...n, [inv.id]: errorText(e) })),
                      ),
                  },
                ])
              }>
              {ti('revoke')}
            </Button>
          </View>
        </View>
      )}
      ItemSeparatorComponent={() => <View className="mx-4 h-px bg-border" />}
      ListEmptyComponent={invitations.isPending ? <LoadingState /> : <EmptyState title={ti('emptyTitle')} description={ti('emptyDescription')} />}
      refreshControl={<RefreshControl refreshing={invitations.isRefetching} onRefresh={() => void invitations.refetch()} tintColor={c.primary} colors={[c.primary]} />}
    />
  );
}
