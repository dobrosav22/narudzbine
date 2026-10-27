import { View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';
import { useIdErrorText } from './error-text';

/** Form-level API error in the UI language, including identity-specific codes. */
export function IdFormError({ error }: { error: unknown }) {
  const c = useTokenColors();
  const errorText = useIdErrorText();
  if (!error) return null;
  return (
    <View accessibilityRole="alert" className="flex-row items-start gap-2 rounded-lg border border-border bg-card p-3">
      <AlertCircle size={16} color={c.destructive} style={{ marginTop: 2 }} />
      <AppText className="flex-1 text-sm text-destructive">{errorText(error)}</AppText>
    </View>
  );
}
