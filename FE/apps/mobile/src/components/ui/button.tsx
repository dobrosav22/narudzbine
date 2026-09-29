import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';

/**
 * Mirrors apps/web's shadcn Button (same variant names, same tokens) — 05 §5:
 * "a screen looks like the same product on both platforms".
 */
const CONTAINER = {
  default: 'bg-primary active:bg-primary-hover',
  outline: 'border border-border bg-background active:bg-muted',
  ghost: 'active:bg-muted',
  destructive: 'bg-destructive/10 active:bg-destructive/20',
} as const;
const LABEL = {
  default: 'text-primary-foreground',
  outline: 'text-foreground',
  ghost: 'text-foreground',
  destructive: 'text-destructive',
} as const;
const SIZE = { default: 'h-11 px-4', sm: 'h-9 px-3' } as const;

export function Button({
  variant = 'default',
  size = 'default',
  loading = false,
  disabled,
  children,
  className,
  ...props
}: PressableProps & {
  variant?: keyof typeof CONTAINER;
  size?: keyof typeof SIZE;
  loading?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const c = useTokenColors();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      aria-disabled={!!inactive}
      aria-busy={loading}
      disabled={inactive}
      className={`flex-row items-center justify-center gap-2 rounded-lg ${SIZE[size]} ${CONTAINER[variant]} ${inactive ? 'opacity-50' : ''} ${className ?? ''}`}
      {...props}>
      {loading && <ActivityIndicator size="small" color={variant === 'default' ? c['primary-foreground'] : c.foreground} />}
      {typeof children === 'string' ? (
        <AppText weight="medium" className={`${size === 'sm' ? 'text-sm' : 'text-base'} ${LABEL[variant]}`}>
          {children}
        </AppText>
      ) : (
        children
      )}
    </Pressable>
  );
}
