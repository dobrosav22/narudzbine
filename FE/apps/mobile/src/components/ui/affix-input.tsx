import { TextInput, View, type TextInputProps } from 'react-native';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';

/** Mirrors web's InputGroup + InputGroupText: an input with a prefix and/or suffix label ("From", "KM", "case"). */
export function AffixInput({
  prefix,
  suffix,
  invalid,
  mono,
  className,
  ...props
}: TextInputProps & { prefix?: React.ReactNode; suffix?: string; invalid?: boolean; mono?: boolean; className?: string }) {
  const c = useTokenColors();
  return (
    <View
      className={`h-11 flex-row items-center gap-2 rounded-lg border bg-background px-3 ${
        invalid ? 'border-destructive' : 'border-input'
      } ${className ?? ''}`}>
      {typeof prefix === 'string' ? <AppText className="text-sm text-muted-foreground">{prefix}</AppText> : prefix}
      <TextInput
        placeholderTextColor={c['muted-foreground']}
        selectionColor={c.primary}
        className={`h-full flex-1 text-base text-foreground ${mono ? 'font-mono' : 'font-sans'}`}
        {...props}
      />
      {suffix && <AppText className="text-sm text-muted-foreground">{suffix}</AppText>}
    </View>
  );
}
