import { useColorScheme } from 'react-native';
import { nativeColors, type TokenName } from '@repo/ui';

export type ColorTokenMap = Record<TokenName, string>;

/**
 * Raw hex tokens for the few native APIs that take a colour prop instead of a
 * className (ActivityIndicator, RefreshControl, icons, navigation theme).
 * Everything else styles with NativeWind classes (bg-primary, text-muted-foreground…).
 */
export function useTokenColors(): ColorTokenMap {
  return nativeColors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
