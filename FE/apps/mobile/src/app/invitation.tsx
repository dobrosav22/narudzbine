import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import {
  acceptTradingInvitation,
  completeMemberSetup,
  isApiError,
  requestInvitationProof,
  textProblem,
  type InvitationPurpose,
  type PendingInvitation,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { useFieldErrorText } from '@/features/auth/error-text';
import { PasswordPairFields, usePasswordPair } from '@/features/auth/fields';
import { IdFormError } from '@/features/auth/form-error';
import { useGuarded } from '@/features/auth/reauth';
import { pendingInvitation } from '@/features/auth/storage';
import { useSession } from '@/lib/session';
import { useT } from '@/lib/i18n';

/**
 * Deep links narudzbine://invitation?token=… (invitation) and ?proof=… (mailbox proof). The
 * purpose isn't readable from the token, so the person chooses. Joining a team and accepting a
 * trading invitation happen here; setting up a new company uses the web app's full form.
 */
export default function InvitationScreen() {
  const t = useT('auth');
  const params = useLocalSearchParams<{ token?: string; proof?: string }>();
  const state = useSession();
  const guarded = useGuarded();
  const [pending, setPending] = useState<PendingInvitation | null | undefined>(undefined);

  useEffect(() => {
    const patch = { ...(params.token ? { token: params.token } : {}), ...(params.proof ? { proof: params.proof } : {}) };
    void (Object.keys(patch).length ? pendingInvitation.merge(patch) : pendingInvitation.read()).then(setPending);
  }, [params.token, params.proof]);

  const proof = useMutation({ mutationFn: (token: string) => requestInvitationProof(token) });
  const accept = useMutation({
    mutationFn: (token: string) => guarded(() => acceptTradingInvitation(token)),
    onSuccess: () => void pendingInvitation.clear(),
  });
  const choose = (purpose: InvitationPurpose) => void pendingInvitation.merge({ purpose }).then(setPending);

  if (pending === undefined) return null;
  if (accept.isSuccess) {
    return (
      <FormScreen>
        <Card>
          <CardHeader title={t('invitation.acceptedTitle')} description={t('invitation.acceptedDescription')} />
          <Button onPress={() => router.replace('/')}>{t('invitation.continue')}</Button>
        </Card>
      </FormScreen>
    );
  }
  if (!pending?.token) {
    return (
      <FormScreen>
        <Card>
          <CardHeader title={t('invitation.missingTitle')} description={t('invitation.missingDescription')} />
        </Card>
      </FormScreen>
    );
  }
  const token = pending.token;
  const canAcceptTrading =
    state.status === 'business' && state.organization.type === 'BUYER' && (state.account.role === 'OWNER' || state.account.role === 'ADMIN');

  return (
    <FormScreen>
      <Card>
        <CardHeader title={t('invitation.title')} description={t('invitation.description')} />
        <View accessibilityRole="radiogroup" accessibilityLabel={t('invitation.purposeLabel')} className="gap-2">
          {(['ORGANIZATION', 'MEMBER', 'TRADING'] as const).map((p) => (
            <View key={p} className="gap-1">
              <Chip role="radio" label={t(`invitation.${p}`)} selected={pending.purpose === p} onPress={() => choose(p)} />
              {pending.purpose === p && <AppText className="text-xs text-muted-foreground">{t(`invitation.${p}Hint`)}</AppText>}
            </View>
          ))}
        </View>
        {pending.purpose === 'ORGANIZATION' && <AppText className="text-sm text-muted-foreground">{t('invitation.organizationOnWeb')}</AppText>}
        {pending.purpose === 'MEMBER' &&
          (pending.proof ? (
            <MemberSetup token={token} proof={pending.proof} />
          ) : (
            <View className="gap-3">
              <AppText className="text-sm text-muted-foreground">{proof.isSuccess ? t('invitation.proofSentDescription') : t('invitation.proofExplain')}</AppText>
              <IdFormError error={proof.error} />
              <Button variant={proof.isSuccess ? 'outline' : 'default'} loading={proof.isPending} onPress={() => proof.mutate(token)}>
                {proof.isSuccess ? t('invitation.sendAgain') : t('invitation.sendProof')}
              </Button>
            </View>
          ))}
        {pending.purpose === 'TRADING' &&
          (state.status === 'signedOut' ? (
            <View className="gap-3">
              <AppText className="text-sm text-muted-foreground">{t('invitation.tradingSignedOut')}</AppText>
              <Button onPress={() => router.push('/login')}>{t('invitation.logInToAccept')}</Button>
            </View>
          ) : canAcceptTrading ? (
            <View className="gap-3">
              <IdFormError error={accept.error && !isApiError(accept.error, 'REAUTHENTICATION_REQUIRED') ? accept.error : null} />
              <Button loading={accept.isPending} onPress={() => accept.mutate(token)}>
                {t('invitation.accept')}
              </Button>
            </View>
          ) : (
            <AppText className="text-sm text-muted-foreground">{t('invitation.tradingWrongAccount')}</AppText>
          ))}
      </Card>
    </FormScreen>
  );
}

function MemberSetup({ token, proof }: { token: string; proof: string }) {
  const t = useT('auth');
  const tp = useT('settings');
  const fieldError = useFieldErrorText();
  const pair = usePasswordPair();
  const [name, setName] = useState('');
  const [attempted, setAttempted] = useState(false);
  const setup = useMutation({
    mutationFn: () => completeMemberSetup({ token, emailProof: proof, password: pair.password, displayName: name.trim() }),
    onSuccess: () => void pendingInvitation.clear(),
  });
  const nameProblem = textProblem(name);
  if (setup.isSuccess) {
    return (
      <View className="gap-3">
        <AppText weight="semibold" className="text-base text-foreground">
          {t('setup.doneTitle')}
        </AppText>
        <AppText className="text-sm text-muted-foreground">{t('setup.doneMember', { email: setup.data.email })}</AppText>
        <Button onPress={() => router.replace('/login')}>{t('goToLogin')}</Button>
      </View>
    );
  }
  return (
    <FieldGroup>
      {setup.error && !isApiError(setup.error, 'PASSWORD_REJECTED') && <IdFormError error={setup.error} />}
      <Field label={t('setup.yourName')} description={t('setup.yourNameHint')}>
        <Input value={name} onChangeText={setName} autoComplete="name" accessibilityLabel={t('setup.yourName')} />
        <FieldError>{(attempted && nameProblem ? tp(nameProblem) : undefined) ?? fieldError(setup.error, 'displayName')}</FieldError>
      </Field>
      <PasswordPairFields pair={pair} attempted={attempted} serverError={fieldError(setup.error, 'password')} />
      <Button
        loading={setup.isPending}
        onPress={() => {
          setAttempted(true);
          if (!nameProblem && pair.valid) setup.mutate();
        }}>
        {t('setup.submitMember')}
      </Button>
    </FieldGroup>
  );
}
