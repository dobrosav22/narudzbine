import { useColorScheme, View } from 'react-native';
import { AppText } from '@/components/app-text';

/** Mirrors web Badge variants (success/warning/info never purple; brand = violet subtle). */
const CONTAINER = {
  outline: 'border border-border',
  secondary: 'bg-secondary',
  brand: 'bg-primary-subtle',
  success: 'bg-success/15',
  warning: 'bg-warning/20',
  info: 'bg-info/15',
  destructive: 'bg-destructive/10',
} as const;
const LABEL = {
  outline: 'text-foreground',
  secondary: 'text-secondary-foreground',
  brand: 'text-primary-subtle-foreground',
  success: 'text-success',
  warning: 'text-warning-foreground',
  info: 'text-info',
  destructive: 'text-destructive',
} as const;

export function Badge({ variant = 'outline', children }: { variant?: keyof typeof CONTAINER; children: string }) {
  // Web's warning badge switches to the amber text in dark mode (dark:text-warning): warning-foreground
  // is the dark ink meant for a solid amber fill and disappears on the dark tint.
  const dark = useColorScheme() === 'dark';
  const label = variant === 'warning' && dark ? 'text-warning' : LABEL[variant];
  return (
    <View className={`self-start rounded-full px-2 py-0.5 ${CONTAINER[variant]}`}>
      <AppText weight="medium" className={`text-xs ${label}`}>
        {children}
      </AppText>
    </View>
  );
}
