import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, TextInput } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { ExternalLogin } from '@/features/auth/external-login';
import { IdFormError } from '@/features/auth/form-error';
import { GuestLanguagePicker } from '@/features/auth/guest-language';
import { sessionStore } from '@/lib/session';
import { useT } from '@/lib/i18n';

export default function LoginScreen() {
  const t = useT('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);

  // Success needs no navigation: the Stack.Protected guards flip and `index` redirects.
  const login = useMutation({ mutationFn: () => sessionStore.login({ email: email.trim(), password }) });

  return (
    <FormScreen>
      <Card>
        <CardHeader title={t('login.title')} description={t('login.description')} />
        <FieldGroup>
          <IdFormError error={login.error} />
          <Field label={t('email')}>
            <Input
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              accessibilityLabel={t('email')}
            />
          </Field>
          <Field label={t('password')}>
            <Input
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => login.mutate()}
              accessibilityLabel={t('password')}
            />
          </Field>
          <Button loading={login.isPending} disabled={!email || !password} onPress={() => login.mutate()}>
            {t('login.submit')}
          </Button>
          <Link href="/forgot-password" asChild>
            <Pressable accessibilityRole="link" className="self-center p-1">
              <AppText className="text-sm text-primary">{t('login.forgot')}</AppText>
            </Pressable>
          </Link>
        </FieldGroup>
        <ExternalLogin />
        <AppText className="text-center text-sm text-muted-foreground">{t('login.noAccount')}</AppText>
      </Card>
      <GuestLanguagePicker />
    </FormScreen>
  );
}
