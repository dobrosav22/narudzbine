import { Text, type TextProps } from 'react-native';

const FAMILY = {
  regular: 'font-sans',
  medium: 'font-sans-medium',
  semibold: 'font-sans-semibold',
} as const;

/**
 * Text with the Geist family for its weight (05 §2). RN can't synthesise
 * weights for custom fonts, so weight picks a family class instead of
 * font-medium/font-semibold. Colour, size etc. go in className as usual.
 */
export function AppText({
  weight = 'regular',
  mono = false,
  className,
  ...props
}: TextProps & { weight?: keyof typeof FAMILY; mono?: boolean; className?: string }) {
  const family = mono ? (weight === 'regular' ? 'font-mono' : 'font-mono-semibold') : FAMILY[weight];
  return <Text className={`${family} ${className ?? ''}`} {...props} />;
}
