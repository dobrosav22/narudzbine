import { useState } from 'react';
import { View } from 'react-native';
import { passwordProblem } from '@repo/core';
import { Field, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { useT } from '@/lib/i18n';

/** New password + confirmation (15–128 code points; the provider may still reject it). */
export function usePasswordPair() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const problem = passwordProblem(password);
  return { password, setPassword, confirm, setConfirm, problem, valid: !problem && confirm === password };
}

export function PasswordPairFields({
  pair,
  attempted,
  serverError,
}: {
  pair: ReturnType<typeof usePasswordPair>;
  attempted: boolean;
  serverError?: string;
}) {
  const t = useT('auth');
  const problem = attempted && pair.problem ? t(pair.problem === 'tooShort' ? 'passwordTooShort' : 'passwordTooLong') : serverError;
  const mismatch = (attempted || pair.confirm.length > 0) && pair.confirm !== pair.password ? t('passwordMismatch') : undefined;
  return (
    <View className="gap-5">
      <Field label={t('newPassword')} description={problem ? undefined : t('passwordHint')}>
        <Input value={pair.password} onChangeText={pair.setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel={t('newPassword')} />
        <FieldError>{problem}</FieldError>
      </Field>
      <Field label={t('confirmPassword')}>
        <Input value={pair.confirm} onChangeText={pair.setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" accessibilityLabel={t('confirmPassword')} />
        <FieldError>{mismatch}</FieldError>
      </Field>
    </View>
  );
}
