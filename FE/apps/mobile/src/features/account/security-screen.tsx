import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { emailProblem, formatDateTime, isApiError, isEmailChangeFinished } from '@repo/core';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { useFieldErrorText, useIdErrorText } from '@/features/auth/error-text';
import { PasswordPairFields, usePasswordPair } from '@/features/auth/fields';
import { IdFormError } from '@/features/auth/form-error';
import { useGuarded } from '@/features/auth/reauth';
import { emailChanges } from '@/features/auth/storage';
import { useT } from '@/lib/i18n';
import { useBusiness } from '@/lib/session';
import {
  useCancelEmailChange,
  useChangePassword,
  useCompleteEmailChange,
  useDeactivateSelf,
  useEmailChange,
  useExternalIdentities,
  useRequestEmailChange,
  useRevokeAllSessions,
  useRevokeSession,
  useSessions,
  useUnlinkExternalIdentity,
} from './queries';

/** Password, login email, sessions, linked sign-in methods and (staff) self-deactivation. */
export function SecurityScreen() {
  return (
    <FormScreen>
      <PasswordCard />
      <EmailCard />
      <SessionsCard />
      <ExternalCard />
      <DeactivateCard />
    </FormScreen>
  );
}

/** Confirmation dialog; resolves true when confirmed. */
function confirm(title: string, message: string, action: string, cancel: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

const ignoreReauth = (show: (e: unknown) => void) => (e: unknown) => {
  if (!isApiError(e, 'REAUTHENTICATION_REQUIRED')) show(e);
};

function PasswordCard() {
  const t = useT('account.password');
  const guarded = useGuarded();
  const fieldError = useFieldErrorText();
  const pair = usePasswordPair();
  const [attempted, setAttempted] = useState(false);
  const change = useChangePassword();
  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      <FieldGroup>
        {change.error && !isApiError(change.error, 'PASSWORD_REJECTED') && !isApiError(change.error, 'REAUTHENTICATION_REQUIRED') && <IdFormError error={change.error} />}
        <PasswordPairFields pair={pair} attempted={attempted} serverError={fieldError(change.error, 'newPassword')} />
        <Button
          loading={change.isPending}
          onPress={() => {
            setAttempted(true);
            if (!pair.valid) return;
            void guarded(() => change.mutateAsync(pair.password))
              .then(() => {
                Alert.alert(t('changed'));
                pair.setPassword('');
                pair.setConfirm('');
                setAttempted(false);
              })
              .catch(() => undefined);
          }}>
          {t('submit')}
        </Button>
      </FieldGroup>
    </Card>
  );
}

function EmailCard() {
  const t = useT('account.email');
  const ts = useT('settings');
  const guarded = useGuarded();
  const { account } = useBusiness();
  const [changeId, setChangeId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [attempted, setAttempted] = useState(false);
  const change = useEmailChange(changeId);
  const request = useRequestEmailChange();
  const cancel = useCancelEmailChange();
  const complete = useCompleteEmailChange();

  useEffect(() => {
    void emailChanges.get(account.id).then(setChangeId);
  }, [account.id]);
  const forget = () => {
    void emailChanges.clear(account.id);
    setChangeId(null);
  };

  const problem = emailProblem(newEmail, true) ?? (newEmail.trim().toLowerCase() === account.email.toLowerCase() ? 'same' : null);
  const current = change.data && !isEmailChangeFinished(change.data) ? change.data : null;

  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      <AppText className="text-sm text-foreground">
        {t('current')}: {account.email}
      </AppText>
      {current ? (
        <View className="gap-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <AppText weight="medium" className="text-sm text-foreground">
              {t('pendingTitle')}
            </AppText>
            <Badge>{t(`states.${current.state}`)}</Badge>
          </View>
          <AppText className="text-sm text-muted-foreground">{t('expires', { date: formatDateTime(current.expiresAt) })}</AppText>
          <AppText className="text-sm text-foreground">{current.oldAddressVerified ? t('oldVerified') : t('oldPending')}</AppText>
          <AppText className="text-sm text-foreground">{current.newAddressVerified ? t('newVerified') : t('newPending')}</AppText>
          <IdFormError error={complete.error ?? cancel.error} />
          <AppText className="text-xs text-muted-foreground">{t('completeHint')}</AppText>
          <Button
            loading={complete.isPending}
            disabled={!current.oldAddressVerified || !current.newAddressVerified}
            onPress={() => void guarded(() => complete.mutateAsync({ changeId: current.id, expectedRevision: current.revision })).then(forget).catch(() => undefined)}>
            {t('complete')}
          </Button>
          <Button variant="outline" onPress={() => void change.refetch()}>
            {t('refresh')}
          </Button>
          {current.state === 'PENDING' && (
            <Button
              variant="ghost"
              loading={cancel.isPending}
              onPress={() => cancel.mutate({ changeId: current.id, expectedRevision: current.revision }, { onSuccess: () => forget() })}>
              {t('cancel')}
            </Button>
          )}
        </View>
      ) : (
        <FieldGroup>
          {request.error && !isApiError(request.error, 'REAUTHENTICATION_REQUIRED') && <IdFormError error={request.error} />}
          <Field label={t('new')}>
            <Input value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" accessibilityLabel={t('new')} />
            <FieldError>{attempted && problem ? (problem === 'same' ? t('same') : ts(problem)) : undefined}</FieldError>
          </Field>
          <Button
            loading={request.isPending}
            onPress={() => {
              setAttempted(true);
              if (problem) return;
              void guarded(() => request.mutateAsync({ newEmail: newEmail.trim(), expectedRevision: account.revision }))
                .then((created) => {
                  void emailChanges.set(account.id, created.id);
                  setChangeId(created.id);
                  setNewEmail('');
                  setAttempted(false);
                })
                .catch(() => undefined);
            }}>
            {t('start')}
          </Button>
        </FieldGroup>
      )}
    </Card>
  );
}

function SessionsCard() {
  const t = useT('account.sessions');
  const tc = useT('common');
  const guarded = useGuarded();
  const errorText = useIdErrorText();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  const show = (e: unknown) => Alert.alert(errorText(e));
  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      <IdFormError error={sessions.error} />
      {sessions.data?.items.map((s) => (
        <View key={s.id} className="flex-row items-center gap-3 border-t border-border pt-3">
          <View className="flex-1 gap-0.5">
            <AppText weight="medium" className="text-sm text-foreground">
              {s.deviceLabel}
            </AppText>
            <AppText className="text-xs text-muted-foreground">
              {t('lastActive')}: {formatDateTime(s.lastActivityAt)}
            </AppText>
          </View>
          {s.current ? (
            <Badge variant="secondary">{t('current')}</Badge>
          ) : (
            <Button variant="ghost" size="sm" onPress={() => revoke.mutate(s.id, { onError: show })}>
              {t('revoke')}
            </Button>
          )}
        </View>
      ))}
      <Button
        variant="outline"
        onPress={() =>
          void confirm(t('revokeAllTitle'), t('revokeAllDescription'), t('revokeAllConfirm'), tc('cancel')).then(
            (ok) => ok && void guarded(() => revokeAll.mutateAsync()).catch(ignoreReauth(show)),
          )
        }>
        {t('revokeAllConfirm')}
      </Button>
    </Card>
  );
}

function ExternalCard() {
  const t = useT('account.external');
  const tc = useT('common');
  const guarded = useGuarded();
  const errorText = useIdErrorText();
  const identities = useExternalIdentities();
  const unlink = useUnlinkExternalIdentity();
  const show = (e: unknown) => Alert.alert(errorText(e));
  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      <IdFormError error={identities.error} />
      {identities.data?.items.length === 0 && <AppText className="text-sm text-muted-foreground">{t('none')}</AppText>}
      {identities.data?.items.map((identity) => {
        const provider = t(`providers.${identity.provider}`);
        return (
          <View key={identity.id} className="flex-row items-center gap-3 border-t border-border pt-3">
            <View className="flex-1 gap-0.5">
              <AppText weight="medium" className="text-sm text-foreground">
                {provider}
              </AppText>
              <AppText className="text-xs text-muted-foreground">{t('linkedOn', { date: formatDateTime(identity.createdAt) })}</AppText>
            </View>
            <Button
              variant="ghost"
              size="sm"
              onPress={() =>
                void confirm(t('unlinkTitle', { provider }), t('unlinkDescription'), t('unlink'), tc('cancel')).then(
                  (ok) => ok && void guarded(() => unlink.mutateAsync(identity.id)).catch(ignoreReauth(show)),
                )
              }>
              {t('unlink')}
            </Button>
          </View>
        );
      })}
    </Card>
  );
}

function DeactivateCard() {
  const t = useT('account.deactivate');
  const tc = useT('common');
  const guarded = useGuarded();
  const errorText = useIdErrorText();
  const { account, organization } = useBusiness();
  const deactivate = useDeactivateSelf();
  const staff = account.role === 'STAFF';
  return (
    <Card>
      <CardHeader title={t('title')} description={t('description', { org: organization.displayName })} />
      {!staff && <AppText className="text-sm text-muted-foreground">{t('notStaff')}</AppText>}
      <Button
        variant="destructive"
        disabled={!staff}
        loading={deactivate.isPending}
        onPress={() =>
          void confirm(t('confirmTitle'), t('confirmDescription'), t('confirm'), tc('cancel')).then(
            (ok) => ok && void guarded(() => deactivate.mutateAsync(account.revision)).catch(ignoreReauth((e) => Alert.alert(errorText(e)))),
          )
        }>
        {t('button')}
      </Button>
    </Card>
  );
}
