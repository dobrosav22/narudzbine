import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, TextInput, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { DEMO_ACCOUNTS, MOCK_PASSWORD, services, USE_MOCKS } from '@repo/core';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { LanguagePicker } from '@/components/language-picker';
import { sessionStore } from '@/lib/session';
import { useT } from '@/lib/i18n';

export default function LoginScreen() {
  const t = useT('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);

  // Success needs no navigation: the Stack.Protected guards flip and `index` redirects by role.
  const login = useMutation({
    mutationFn: () => services.auth.login({ email, password }),
    onSuccess: (session) => sessionStore.signIn(session),
  });

  return (
    <FormScreen>
      <Card>
        <CardHeader title={t('login.title')} description={t('login.description')} />
        <FieldGroup>
          <FormError error={login.error} />
          <Field label={t('email')}>
            <Input
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
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
        </FieldGroup>
        <View className="flex-row flex-wrap justify-center gap-1">
          <AppText className="text-sm text-muted-foreground">{t('login.selling')}</AppText>
          <Link href="/register" asChild>
            <Pressable accessibilityRole="link">
              <AppText className="text-sm text-primary">{t('login.createVendor')}</AppText>
            </Pressable>
          </Link>
        </View>
      </Card>

      <LanguagePicker />

      {USE_MOCKS && (
        <View className="gap-2">
          <AppText className="text-xs text-muted-foreground">
            {t('login.demoAccounts')} <AppText mono className="text-xs text-muted-foreground">{MOCK_PASSWORD}</AppText>
          </AppText>
          {/* The Platform Admin is web-only (02 v1.1), so its demo account isn't offered here. */}
          {DEMO_ACCOUNTS.filter((a) => !a.webOnly).map((a) => (
            <Pressable
              key={a.email}
              accessibilityRole="button"
              onPress={() => {
                setEmail(a.email);
                setPassword(MOCK_PASSWORD);
              }}
              className="gap-0.5 rounded-lg border border-border bg-background p-3 active:bg-muted">
              <AppText weight="medium" className="text-sm text-foreground">
                {a.email}
              </AppText>
              <AppText className="text-xs text-muted-foreground">{a.label}</AppText>
            </Pressable>
          ))}
        </View>
      )}
    </FormScreen>
  );
}
