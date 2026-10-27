import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Languages, MapPin } from 'lucide-react-native';
import { BACKEND_LOCALES, isApiError, textProblem, type Locale } from '@repo/core';
import { FormScreen } from '@/components/form-screen';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, FieldGroup, Input } from '@/components/ui/field';
import { FieldError } from '@/components/ui/field-error';
import { useIdErrorText } from '@/features/auth/error-text';
import { IdFormError } from '@/features/auth/form-error';
import { useActiveLocations } from '@/features/org-admin/queries';
import { changeLanguage, useT } from '@/lib/i18n';
import { sessionStore, useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useUpdateProfile } from './queries';
import { OptionRow, Section } from './rows';

/** Own name, home location and language. */
export function ProfileScreen() {
  const t = useT('account');
  const ts = useT('settings');
  const c = useTokenColors();
  const errorText = useIdErrorText();
  const { account, organization } = useBusiness();
  const [name, setName] = useState(account.displayName);
  const [home, setHome] = useState<string | null>(account.homeLocationId);
  const [attempted, setAttempted] = useState(false);
  const save = useUpdateProfile();
  const locations = useActiveLocations();
  const problem = textProblem(name);
  const orgLanguage = BACKEND_LOCALES.find((l) => l.value === organization.defaultLanguage)?.label ?? organization.defaultLanguage;
  const setLanguage = (next: Locale | null) => void changeLanguage(next).catch((e: unknown) => Alert.alert(errorText(e)));

  return (
    <FormScreen>
      <Card>
        <CardHeader title={t('profile.title')} description={t('profile.description')} />
        <FieldGroup>
          {isApiError(save.error, 'REVISION_CONFLICT') ? (
            <View className="gap-2">
              <IdFormError error={save.error} />
              <Button variant="outline" size="sm" onPress={() => void sessionStore.refresh().then(() => save.reset())}>
                {ts('loadLatest')}
              </Button>
            </View>
          ) : (
            <IdFormError error={save.error} />
          )}
          <Field label={t('profile.name')}>
            <Input value={name} onChangeText={setName} autoComplete="name" accessibilityLabel={t('profile.name')} />
            <FieldError>{attempted && problem ? ts(problem) : undefined}</FieldError>
          </Field>
          <Field label={t('profile.email')} description={t('profile.emailHint')}>
            <Input value={account.email} editable={false} accessibilityLabel={t('profile.email')} />
          </Field>
        </FieldGroup>
        <Section title={t('profile.home')}>
          <OptionRow icon={<MapPin size={18} color={c['muted-foreground']} />} title={t('profile.noHome')} selected={home === null} onPress={() => setHome(null)} />
          {(locations.data?.items ?? []).map((l) => (
            <OptionRow key={l.id} icon={<MapPin size={18} color={c['muted-foreground']} />} title={l.name} selected={home === l.id} onPress={() => setHome(l.id)} />
          ))}
        </Section>
        <Button
          loading={save.isPending}
          onPress={() => {
            setAttempted(true);
            if (problem) return;
            save.mutate(
              { expectedRevision: account.revision, displayName: name.trim(), homeLocationId: home },
              { onSuccess: () => Alert.alert(t('profile.saved')) },
            );
          }}>
          {t('profile.save')}
        </Button>
      </Card>

      <Section title={t('language.title')}>
        <OptionRow
          icon={<Languages size={18} color={c['muted-foreground']} />}
          title={t('language.inherit', { language: orgLanguage })}
          selected={account.languageOverride === null}
          onPress={() => setLanguage(null)}
        />
        {BACKEND_LOCALES.map((l) => (
          <OptionRow
            key={l.value}
            icon={<Languages size={18} color={c['muted-foreground']} />}
            title={l.label}
            selected={account.languageOverride === l.value}
            onPress={() => setLanguage(l.value)}
          />
        ))}
      </Section>
    </FormScreen>
  );
}
