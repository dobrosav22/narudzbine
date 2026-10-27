import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  canManageOrganization,
  emailProblem,
  formatDateTime,
  invitableRoles,
  isApiError,
  isUncertainOutcome,
  isUuid,
  memberActions,
  organizationQueries,
  uuidv4,
  type Account,
  type Invitation,
  type OwnershipTransfer,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { useIdErrorText } from '@/features/auth/error-text';
import { IdFormError } from '@/features/auth/form-error';
import { useGuarded } from '@/features/auth/reauth';
import { useT } from '@/lib/i18n';
import { sessionStore, useBusiness } from '@/lib/session';
import { useProblemText } from './parts';
import {
  useAcceptTransfer,
  useChangeMemberRole,
  useDeactivateMember,
  useInvitations,
  useInviteMember,
  useLatestTransfer,
  useMembers,
  useReactivateMember,
  useRequestTransfer,
  useResendInvitation,
  useRevokeInvitation,
  useRevokeTransfer,
} from './queries';

/** Members, member invitations and ownership transfer. */
export function TeamScreen() {
  const { account } = useBusiness();
  const manager = canManageOrganization(account.role);
  return (
    <FormScreen>
      <MembersCard />
      {manager && <InviteCard />}
      {manager && <InvitationsCard />}
      <OwnershipCard />
    </FormScreen>
  );
}

function MembersCard() {
  const t = useT('settings.team');
  const tc = useT('common');
  const errorText = useIdErrorText();
  const guarded = useGuarded();
  const { account, organization } = useBusiness();
  const [state, setState] = useState<'ACTIVE' | 'DEACTIVATED'>('ACTIVE');
  const members = useMembers({ state, size: 100 });
  const changeRole = useChangeMemberRole();
  const deactivate = useDeactivateMember();
  const reactivate = useReactivateMember();
  const offer = useRequestTransfer();
  const fail = (e: unknown) => {
    if (isApiError(e, 'REVISION_CONFLICT')) void members.refetch();
    if (!isApiError(e, 'REAUTHENTICATION_REQUIRED')) Alert.alert(errorText(e));
  };

  const actionsFor = (m: Account) => {
    const can = memberActions(account, m);
    const buttons: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (can.changeRole) {
      const role = m.role === 'ADMIN' ? 'STAFF' : 'ADMIN';
      buttons.push({
        text: role === 'STAFF' ? t('makeStaff') : t('makeAdmin'),
        onPress: () => void guarded(() => changeRole.mutateAsync({ id: m.id, revision: m.revision, role })).catch(fail),
      });
    }
    if (can.reactivate) buttons.push({ text: t('reactivate'), onPress: () => void guarded(() => reactivate.mutateAsync({ id: m.id, revision: m.revision })).catch(fail) });
    if (can.transferOwnership)
      buttons.push({
        text: t('offerOwnership'),
        onPress: () =>
          Alert.alert(t('transfer.offerTitle', { name: m.displayName }), t('transfer.offerDescription', { name: m.displayName }), [
            { text: tc('cancel'), style: 'cancel' },
            { text: t('transfer.offer'), onPress: () => void guarded(() => offer.mutateAsync({ recipientId: m.id, orgRevision: organization.revision })).catch(fail) },
          ]),
      });
    if (can.deactivate)
      buttons.push({
        text: t('deactivate'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('deactivateTitle', { name: m.displayName }), t('deactivateDescription'), [
            { text: tc('cancel'), style: 'cancel' },
            { text: t('deactivate'), style: 'destructive', onPress: () => void guarded(() => deactivate.mutateAsync({ id: m.id, revision: m.revision })).catch(fail) },
          ]),
      });
    return buttons;
  };

  return (
    <Card>
      <CardHeader title={t('members')} description={t('rolesNote')} />
      <View className="flex-row gap-2">
        <Chip role="radio" label={t('stateFilter.ACTIVE')} selected={state === 'ACTIVE'} onPress={() => setState('ACTIVE')} />
        <Chip role="radio" label={t('stateFilter.DEACTIVATED')} selected={state === 'DEACTIVATED'} onPress={() => setState('DEACTIVATED')} />
      </View>
      {members.isError ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : members.isPending ? (
        <LoadingState />
      ) : (
        members.data.items.map((m) => {
          const buttons = actionsFor(m);
          return (
            <View key={m.id} className="flex-row items-center gap-3 border-t border-border pt-3">
              <View className="flex-1 gap-0.5">
                <AppText weight="medium" className="text-sm text-foreground">
                  {m.displayName}
                  {m.id === account.id ? ` (${t('you')})` : ''}
                </AppText>
                <AppText className="text-xs text-muted-foreground">{m.email}</AppText>
              </View>
              <Badge variant={m.role === 'OWNER' ? 'brand' : 'outline'}>{m.role ? t(`roles.${m.role}`) : '—'}</Badge>
              {buttons.length > 0 && (
                <Button variant="ghost" size="sm" onPress={() => Alert.alert(m.displayName, undefined, [...buttons, { text: tc('cancel'), style: 'cancel' }])}>
                  {t('actions')}
                </Button>
              )}
            </View>
          );
        })
      )}
    </Card>
  );
}

function InviteCard() {
  const t = useT('settings.team');
  const problemText = useProblemText();
  const { account, organization } = useBusiness();
  const roles = invitableRoles(account.role);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const [attempted, setAttempted] = useState(false);
  const invite = useInviteMember();
  const problem = emailProblem(email, true);
  return (
    <Card>
      <CardHeader title={t('inviteTitle')} description={t('inviteDescription', { org: organization.displayName })} />
      <FieldGroup>
        <IdFormError error={invite.error} />
        <Field label={t('inviteEmail')}>
          <Input value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" accessibilityLabel={t('inviteEmail')} />
          <FieldError>{attempted ? problemText(problem) : undefined}</FieldError>
        </Field>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('inviteRole')} className="flex-row gap-2">
          {roles.map((r) => (
            <Chip key={r} role="radio" label={t(`roles.${r}`)} selected={role === r} onPress={() => setRole(r)} />
          ))}
        </View>
        <Button
          loading={invite.isPending}
          onPress={() => {
            setAttempted(true);
            if (problem) return;
            invite.mutate(
              { email: email.trim(), role },
              {
                onSuccess: (i) => {
                  Alert.alert(t('invited', { email: i.recipientEmail }));
                  setEmail('');
                  setAttempted(false);
                },
              },
            );
          }}>
          {t('send')}
        </Button>
      </FieldGroup>
    </Card>
  );
}

function InvitationsCard() {
  const t = useT('settings.team');
  const errorText = useIdErrorText();
  const invitations = useInvitations({ state: 'PENDING', size: 100 }, true);
  const revoke = useRevokeInvitation();
  const resend = useResendInvitation();
  // Idempotency-Key per resend intent, reused only after an uncertain outcome.
  const keys = useRef(new Map<string, string>());
  const items = invitations.data?.items.filter((i) => i.purpose === 'MEMBER') ?? [];
  const doResend = (i: Invitation) => {
    const key = keys.current.get(i.id) ?? uuidv4();
    keys.current.set(i.id, key);
    resend.mutate(
      { id: i.id, revision: i.revision, key },
      {
        onSuccess: () => {
          keys.current.delete(i.id);
          Alert.alert(t('resent', { email: i.recipientEmail }));
        },
        onError: (e) => {
          if (!isUncertainOutcome(e)) keys.current.delete(i.id);
          Alert.alert(errorText(e));
        },
      },
    );
  };
  return (
    <Card>
      <CardHeader title={t('invitations')} description={t('invitationsDescription')} />
      {invitations.isError && <IdFormError error={invitations.error} />}
      {items.length === 0 && !invitations.isPending && <AppText className="text-sm text-muted-foreground">{t('noInvitations')}</AppText>}
      {items.map((i) => (
        <View key={i.id} className="gap-2 border-t border-border pt-3">
          <AppText mono className="text-sm text-foreground">
            {i.recipientEmail}
          </AppText>
          <AppText className="text-xs text-muted-foreground">
            {t(`delivery.${i.deliveryState}`)} · {t('expires', { date: formatDateTime(i.expiresAt) })}
          </AppText>
          <View className="flex-row gap-2">
            <Button variant="outline" size="sm" onPress={() => doResend(i)}>
              {t('resend')}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => revoke.mutate(i.id, { onError: (e) => Alert.alert(errorText(e)) })}>
              {t('revoke')}
            </Button>
          </View>
        </View>
      ))}
    </Card>
  );
}

function OwnershipCard() {
  const t = useT('settings.team');
  const qc = useQueryClient();
  const { account } = useBusiness();
  const latest = useLatestTransfer(canManageOrganization(account.role));
  const members = useMembers({ size: 100 });
  const [reference, setReference] = useState('');
  const [looked, setLooked] = useState<OwnershipTransfer | null>(null);
  const [lookError, setLookError] = useState<unknown>(null);
  const transfer = looked ?? latest.data ?? null;
  const nameOf = (id: string) => members.data?.items.find((m) => m.id === id)?.displayName ?? t('someone');
  const lookUp = () => {
    setLookError(null);
    qc.fetchQuery(organizationQueries.transfer(reference.trim().toLowerCase())).then(setLooked, setLookError);
  };
  return (
    <Card>
      <CardHeader title={t('transfer.title')} description={t('transfer.description')} />
      {transfer && <TransferStatus transfer={transfer} recipientName={nameOf(transfer.recipientAccountId)} onChanged={() => setLooked(null)} />}
      {account.role !== 'OWNER' && (!transfer || transfer.state !== 'PENDING') && (
        <FieldGroup>
          <Field label={t('transfer.haveReference')}>
            <Input value={reference} onChangeText={setReference} autoCapitalize="none" placeholder={t('transfer.enterReference')} accessibilityLabel={t('transfer.enterReference')} />
            <FieldError>{reference && !isUuid(reference) ? t('transfer.referenceInvalid') : isApiError(lookError, 'NOT_FOUND') ? t('transfer.notFound') : undefined}</FieldError>
          </Field>
          {!!lookError && !isApiError(lookError, 'NOT_FOUND') && <IdFormError error={lookError} />}
          <Button variant="outline" disabled={!isUuid(reference)} onPress={lookUp}>
            {t('transfer.lookUp')}
          </Button>
        </FieldGroup>
      )}
    </Card>
  );
}

function TransferStatus({ transfer, recipientName, onChanged }: { transfer: OwnershipTransfer; recipientName: string; onChanged: () => void }) {
  const t = useT('settings.team');
  const guarded = useGuarded();
  const errorText = useIdErrorText();
  const { account, organization } = useBusiness();
  const revoke = useRevokeTransfer();
  const accept = useAcceptTransfer();
  if (transfer.state !== 'PENDING') {
    return <AppText className="text-sm text-muted-foreground">{t('transfer.lastOffer', { name: recipientName, state: t(`transfer.states.${transfer.state}`) })}</AppText>;
  }
  const isRecipient = transfer.recipientAccountId === account.id;
  return (
    <View className="gap-3">
      <AppText className="text-sm text-foreground">
        {isRecipient
          ? t('transfer.pendingRecipient', { org: organization.displayName, date: formatDateTime(transfer.expiresAt) })
          : t('transfer.pending', { name: recipientName, date: formatDateTime(transfer.expiresAt) })}
      </AppText>
      {account.role === 'OWNER' && (
        <View className="gap-1">
          <AppText className="text-xs text-muted-foreground">{t('transfer.reference')}</AppText>
          <AppText mono selectable className="text-xs text-foreground">
            {transfer.id}
          </AppText>
          <AppText className="text-xs text-muted-foreground">{t('transfer.referenceHint')}</AppText>
          <Button
            variant="outline"
            loading={revoke.isPending}
            onPress={() => revoke.mutate({ id: transfer.id, revision: transfer.revision }, { onSuccess: onChanged, onError: (e) => Alert.alert(errorText(e)) })}>
            {t('transfer.revoke')}
          </Button>
        </View>
      )}
      {isRecipient && (
        <Button
          loading={accept.isPending}
          onPress={() =>
            void guarded(() => accept.mutateAsync({ id: transfer.id, revision: transfer.revision }))
              .then(() => {
                Alert.alert(t('transfer.acceptedTitle'), t('transfer.acceptedDescription'));
                void sessionStore.expire();
              })
              .catch((e: unknown) => !isApiError(e, 'REAUTHENTICATION_REQUIRED') && Alert.alert(errorText(e)))
          }>
          {t('transfer.accept')}
        </Button>
      )}
    </View>
  );
}
