import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isServiceError, services, type InvitePreview } from '@repo/core';
import { FormScreen } from '@/components/form-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, FieldSeparator, Input } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { sessionStore } from '@/lib/session';
import { useT, useUiLocale } from '@/lib/i18n';

/** Deep link narudzbine://invite/<token> — same three variants as web (03 → "Invite acceptance"). */
export default function InviteScreen() {
  const t = useT('auth.invite');
  const tm = useT('m.common');
  const { token } = useLocalSearchParams<{ token: string }>();
  const preview = useQuery({ queryKey: ['invite', token], queryFn: () => services.invites.getByToken(token) });

  if (preview.isPending) return <LoadingState label={tm('loadingInvite')} />;
  if (preview.isError) {
    return isServiceError(preview.error, 'NOT_FOUND') ? (
      <EmptyState
        title={t('invalidTitle')}
        description={t('invalidDescription')}
      />
    ) : (
      <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />
    );
  }
  if (preview.data.invite.status !== 'pending') {
    return (
      <EmptyState
        title={t('usedTitle', { status: preview.data.invite.status })}
        description={t('usedDescription')}
      />
    );
  }
  return <InviteForm token={token} preview={preview.data} />;
}

function InviteForm({ token, preview }: { token: string; preview: InvitePreview }) {
  const t = useT('auth.invite');
  const ta = useT('auth');
  const locale = useUiLocale();
  const { invite, orgName, emailHasAccount } = preview;
  const isBuyerOrgInvite = invite.type === 'buyer_org_invite';
  const [form, setForm] = useState({ name: '', password: '', orgName: '', locationName: '', locationAddress: '' });
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const accept = useMutation({
    // A brand-new login starts in the language on screen; an existing person keeps theirs (01 §12).
    mutationFn: () => services.auth.acceptInvite(token, { ...form, preferredLocale: locale }),
    onSuccess: async (session) => {
      const target = isBuyerOrgInvite
        ? session.memberships.find((m) => m.orgType === 'buyer')
        : session.memberships.find((m) => m.org.id === invite.targetOrgId);
      await sessionStore.signIn(session, target?.org.id);
      if (isBuyerOrgInvite && invite.vendorOrgId) await sessionStore.selectVendor(invite.vendorOrgId);
      router.replace('/');
    },
  });

  const title = isBuyerOrgInvite ? t('buyerTitle', { org: orgName }) : t('teamTitle', { org: orgName });
  const description = isBuyerOrgInvite
    ? emailHasAccount
      ? t('buyerExisting', { org: orgName })
      : t('buyerNew', { org: orgName })
    : emailHasAccount
      ? t('teamExisting', { org: orgName })
      : t('teamNew', { org: orgName });
  const needsCompany = isBuyerOrgInvite && !emailHasAccount;
  const complete =
    form.password &&
    (emailHasAccount || form.name) &&
    (!needsCompany || (form.orgName && form.locationAddress));

  return (
    <FormScreen>
      <Card>
        <CardHeader title={title} description={description} />
        <FieldGroup>
          <FormError error={accept.error} />
          <Field label={ta('email')} description={t('sentTo')}>
            <Input value={invite.email} editable={false} accessibilityLabel={ta('email')} />
          </Field>
          {!emailHasAccount && (
            <Field label={ta('yourName')}>
              <Input value={form.name} onChangeText={set('name')} autoComplete="name" accessibilityLabel={ta('yourName')} />
            </Field>
          )}
          <Field label={emailHasAccount ? ta('password') : t('choosePassword')}>
            <Input
              value={form.password}
              onChangeText={set('password')}
              secureTextEntry
              autoComplete={emailHasAccount ? 'current-password' : 'new-password'}
              accessibilityLabel={ta('password')}
            />
          </Field>
          {needsCompany && (
            <>
              <FieldSeparator>{t('yourCompany')}</FieldSeparator>
              <Field label={ta('companyName')}>
                <Input value={form.orgName} onChangeText={set('orgName')} autoComplete="organization" accessibilityLabel={ta('companyName')} />
              </Field>
              <Field label={t('locationName')} description={t('locationHint')}>
                <Input
                  value={form.locationName}
                  onChangeText={set('locationName')}
                  placeholder={t('locationPlaceholder')}
                  accessibilityLabel={t('locationName')}
                />
              </Field>
              <Field label={t('address')}>
                <Input
                  value={form.locationAddress}
                  onChangeText={set('locationAddress')}
                  autoComplete="street-address"
                  accessibilityLabel={t('address')}
                />
              </Field>
            </>
          )}
          <Button loading={accept.isPending} disabled={!complete} onPress={() => accept.mutate()}>
            {emailHasAccount ? t('loginAccept') : t('accept')}
          </Button>
        </FieldGroup>
      </Card>
    </FormScreen>
  );
}
