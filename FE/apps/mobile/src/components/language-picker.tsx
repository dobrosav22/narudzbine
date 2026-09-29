import { View } from 'react-native';
import { SUPPORTED_LOCALES, type AppLocale } from '@repo/core';
import { Chip } from '@/components/ui/chip';
import { changeLocale, useUiLocale, useT } from '@/lib/i18n';

/**
 * 05 §6 language switcher for screens before login: text labels ("English" / "Srpski"),
 * no flags. Signed-in people switch from the Account tab, which saves it on their login.
 */
export function LanguagePicker() {
  const t = useT('common');
  const locale = useUiLocale();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('language')} className="flex-row justify-center gap-2">
      {SUPPORTED_LOCALES.map((l) => (
        <Chip key={l.value} role="radio" label={l.label} selected={l.value === locale} onPress={() => void changeLocale(l.value as AppLocale)} />
      ))}
    </View>
  );
}
