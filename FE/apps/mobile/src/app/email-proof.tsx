import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { verifyEmailChangeProof } from '@repo/core';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { IdFormError } from '@/features/auth/form-error';
import { useT } from '@/lib/i18n';

/** Deep link narudzbine://email-proof?token=…: confirms one mailbox of a pending login-email change. */
export default function EmailProofScreen() {
  const t = useT('auth.emailProof');
  const { token } = useLocalSearchParams<{ token?: string }>();
  const verify = useMutation({ mutationFn: (value: string) => verifyEmailChangeProof(value) });
  return (
    <FormScreen>
      {!token ? (
        <Card>
          <CardHeader title={t('missingTitle')} description={t('missingDescription')} />
        </Card>
      ) : verify.isSuccess ? (
        <Card>
          <CardHeader title={t('doneTitle')} description={t('doneDescription')} />
          <Button onPress={() => router.replace('/')}>{t('continue')}</Button>
        </Card>
      ) : (
        <Card>
          <CardHeader title={t('title')} description={t('description')} />
          <IdFormError error={verify.error} />
          <Button loading={verify.isPending} onPress={() => verify.mutate(token)}>
            {t('submit')}
          </Button>
        </Card>
      )}
    </FormScreen>
  );
}
