import { Platform, Switch, useColorScheme, View } from 'react-native';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';

/** Mirrors web's horizontal Field + Switch. Checked track = primary violet, like shadcn's Switch. */
export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** Defaults to `label`; set it when the visible label alone is ambiguous ("Email" in a matrix). */
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const c = useTokenColors();
  // Same thumb as web's shadcn Switch: background in light mode; in dark, primary-foreground when on
  // and foreground when off (a background-coloured thumb vanishes into the dark track).
  const dark = useColorScheme() === 'dark';
  const thumb = dark ? (value ? c['primary-foreground'] : c.foreground) : c.background;
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 gap-0.5">
        <AppText weight="medium" className="text-sm text-foreground">
          {label}
        </AppText>
        {description && <AppText className="text-sm text-muted-foreground">{description}</AppText>}
      </View>
      <Switch
        accessibilityLabel={accessibilityLabel ?? label}
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: c.primary, false: c.input }}
        thumbColor={thumb}
        ios_backgroundColor={c.input}
        // react-native-web reads its own prop for the "on" thumb (default teal) and ignores thumbColor there.
        {...(Platform.OS === 'web' ? ({ activeThumbColor: thumb } as object) : {})}
      />
    </View>
  );
}
