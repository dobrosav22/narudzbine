import { AppText } from '@/components/app-text';

/** Mirrors web's FieldError. */
export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <AppText accessibilityRole="alert" className="text-sm text-destructive">
      {children}
    </AppText>
  );
}
