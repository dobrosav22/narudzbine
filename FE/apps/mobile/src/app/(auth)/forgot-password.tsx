import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { requestPasswordReset } from '@repo/core';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { IdFormError } from '@/features/auth/form-error';
import { useT } from '@/lib/i18n';

/** Generic answer whether or not the address has an account. */
export default function ForgotPasswordScreen() {
  const t = useT('auth');
  const [email, setEmail] = useState('');
  const request = useMutation({ mutationFn: () => requestPasswordReset(email.trim()) });
  return (
    <FormScreen>
      {request.isSuccess ? (
        <Card>
          <CardHeader title={t('forgot.sentTitle')} description={t('forgot.sentDescription', { email: email.trim() })} />
          <Button variant="outline" onPress={() => router.back()}>
            {t('backToLogin')}
          </Button>
        </Card>
      ) : (
        <Card>
          <CardHeader title={t('forgot.title')} description={t('forgot.description')} />
          <FieldGroup>
            <IdFormError error={request.error} />
            <Field label={t('email')}>
              <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" accessibilityLabel={t('email')} />
            </Field>
            <Button loading={request.isPending} disabled={!email.trim()} onPress={() => request.mutate()}>
              {t('forgot.submit')}
            </Button>
          </FieldGroup>
        </Card>
      )}
    </FormScreen>
  );
}
