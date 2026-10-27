import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { completePasswordReset, isApiError } from '@repo/core';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { useFieldErrorText } from '@/features/auth/error-text';
import { PasswordPairFields, usePasswordPair } from '@/features/auth/fields';
import { IdFormError } from '@/features/auth/form-error';
import { useT } from '@/lib/i18n';

/** Deep link narudzbine://reset-password?token=… (the emailed web link carries the same token). */
export default function ResetPasswordScreen() {
  const t = useT('auth');
  const { token } = useLocalSearchParams<{ token?: string }>();
  const pair = usePasswordPair();
  const [attempted, setAttempted] = useState(false);
  const fieldError = useFieldErrorText();
  const reset = useMutation({ mutationFn: (value: string) => completePasswordReset(value, pair.password) });

  if (!token) {
    return (
      <FormScreen>
        <Card>
          <CardHeader title={t('reset.missingTitle')} description={t('reset.missingDescription')} />
          <Button onPress={() => router.replace('/forgot-password')}>{t('reset.requestNew')}</Button>
        </Card>
      </FormScreen>
    );
  }
  return (
    <FormScreen>
      {reset.isSuccess ? (
        <Card>
          <CardHeader title={t('reset.doneTitle')} description={t('reset.doneDescription')} />
          <Button onPress={() => router.replace('/login')}>{t('goToLogin')}</Button>
        </Card>
      ) : (
        <Card>
          <CardHeader title={t('reset.title')} description={t('reset.description')} />
          <FieldGroup>
            {reset.error && !isApiError(reset.error, 'PASSWORD_REJECTED') && <IdFormError error={reset.error} />}
            <PasswordPairFields pair={pair} attempted={attempted} serverError={fieldError(reset.error, 'newPassword')} />
            <Button
              loading={reset.isPending}
              disabled={isApiError(reset.error, 'TOKEN_INVALID')}
              onPress={() => {
                setAttempted(true);
                if (pair.valid) reset.mutate(token);
              }}>
              {t('reset.submit')}
            </Button>
          </FieldGroup>
        </Card>
      )}
    </FormScreen>
  );
}
