import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';

/** Mirrors web's FieldGroup/Field/FieldLabel/FieldDescription composition. */
export function FieldGroup({ children }: { children: React.ReactNode }) {
  return <View className="gap-5">{children}</View>;
}

export function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <AppText weight="medium" className="text-sm text-foreground">
        {label}
      </AppText>
      {children}
      {description && <AppText className="text-sm text-muted-foreground">{description}</AppText>}
    </View>
  );
}

export const Input = forwardRef<TextInput, TextInputProps & { className?: string }>(function Input(
  { className, editable = true, ...props },
  ref,
) {
  const c = useTokenColors();
  return (
    <TextInput
      ref={ref}
      editable={editable}
      placeholderTextColor={c['muted-foreground']}
      selectionColor={c.primary}
      className={`h-11 rounded-lg border border-input bg-background px-3 font-sans text-base text-foreground focus:border-ring ${
        editable ? '' : 'bg-muted text-muted-foreground'
      } ${className ?? ''}`}
      {...props}
    />
  );
});

export function FieldSeparator({ children }: { children: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-border" />
      <AppText className="text-sm text-muted-foreground">{children}</AppText>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}
