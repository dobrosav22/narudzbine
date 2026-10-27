import { View } from 'react-native';
import { SUPPORTED_LOCALES } from '@repo/core';
import { Chip } from '@/components/ui/chip';
import { setGuestLocale, useT, useUiLocale } from '@/lib/i18n';

/** Language choice before login (text labels, no flags); signed-in people choose it on their profile. */
export function GuestLanguagePicker() {
  const t = useT('common');
  const locale = useUiLocale();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('language')} className="flex-row justify-center gap-2">
      {SUPPORTED_LOCALES.map((l) => (
        <Chip key={l.value} role="radio" label={l.label} selected={l.value === locale} onPress={() => setGuestLocale(l.value)} />
      ))}
    </View>
  );
}
