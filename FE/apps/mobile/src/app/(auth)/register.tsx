import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { formatMoney, formatNumber, services } from '@repo/core';
import { AppText } from '@/components/app-text';
import { FormScreen } from '@/components/form-screen';
import { ErrorState, LoadingState } from '@/components/query-states';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { sessionStore } from '@/lib/session';
import { useT, useUiLocale } from '@/lib/i18n';

/** Vendor self-serve signup (03 → "Vendor onboarding": sign up + choose tier). */
export default function RegisterScreen() {
  const t = useT('auth');
  const tp = useT('planText');
  const tm = useT('m.common');
  const locale = useUiLocale();
  const tiers = useQuery({ queryKey: ['subscriptionTiers'], queryFn: () => services.subscription.listTiers() });
  const [form, setForm] = useState({ name: '', email: '', password: '', orgName: '' });
  const [tierId, setTierId] = useState<string>();
  const selectedTier = tierId ?? tiers.data?.[0]?.id;
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const register = useMutation({
    // The language on screen becomes the new account's preferredLocale (01 §12).
    mutationFn: () => services.auth.registerVendor({ ...form, subscriptionTierId: selectedTier ?? '', preferredLocale: locale }),
    // A new vendor starts with an empty catalogue (03 → "Vendor onboarding"), like web — not the dashboard.
    onSuccess: async (session) => {
      await sessionStore.signIn(session);
      router.replace('/vendor/catalogue');
    },
  });
  const complete = form.name && form.email && form.password && form.orgName && selectedTier;

  return (
    <FormScreen>
      <Card>
        <CardHeader title={t('register.title')} description={t('register.description')} />
        <FieldGroup>
          <FormError error={register.error} />
          <Field label={t('companyName')}>
            <Input value={form.orgName} onChangeText={set('orgName')} autoComplete="organization" accessibilityLabel={t('companyName')} />
          </Field>
          <Field label={t('yourName')}>
            <Input value={form.name} onChangeText={set('name')} autoComplete="name" accessibilityLabel={t('yourName')} />
          </Field>
          <Field label={t('register.workEmail')}>
            <Input
              value={form.email}
              onChangeText={set('email')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              accessibilityLabel={t('register.workEmail')}
            />
          </Field>
          <Field label={t('password')}>
            <Input
              value={form.password}
              onChangeText={set('password')}
              secureTextEntry
              autoComplete="new-password"
              accessibilityLabel={t('password')}
            />
          </Field>

          <Field label={t('register.plan')} description={t('register.planNote')}>
            {tiers.isPending ? (
              <LoadingState label={tm('loadingPlans')} />
            ) : tiers.isError ? (
              <ErrorState error={tiers.error} onRetry={() => void tiers.refetch()} />
            ) : (
              <View className="gap-2" accessibilityRole="radiogroup">
                {tiers.data.map((tier) => {
                  const selected = tier.id === selectedTier;
                  return (
                    // Same "choice card" as web: selected = violet border + subtle fill.
                    <Pressable
                      key={tier.id}
                      accessibilityRole="radio"
                      aria-checked={selected}
                      onPress={() => setTierId(tier.id)}
                      className={`flex-row items-center gap-3 rounded-lg border p-3 ${
                        selected ? 'border-primary bg-primary-subtle/40' : 'border-border bg-background'
                      }`}>
                      <View className="flex-1 gap-0.5">
                        <AppText weight="medium" className="text-sm text-foreground">
                          {tp('perMonth', { plan: tier.name, price: formatMoney(tier.priceMonthly) })}
                        </AppText>
                        <AppText className="text-sm text-muted-foreground">
                          {tp('limits', { products: formatNumber(tier.maxProducts), buyers: formatNumber(tier.maxBuyers) })}
                        </AppText>
                      </View>
                      <View
                        className={`size-5 items-center justify-center rounded-full border ${selected ? 'border-primary' : 'border-input'}`}>
                        {selected && <View className="size-2.5 rounded-full bg-primary" />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Field>

          <Button loading={register.isPending} disabled={!complete} onPress={() => register.mutate()}>
            {t('register.submit')}
          </Button>
        </FieldGroup>
      </Card>
    </FormScreen>
  );
}
