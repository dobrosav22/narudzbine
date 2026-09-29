import { Pressable } from 'react-native';
import { AppText } from '@/components/app-text';

/**
 * Selectable chip — mirrors web's outline ToggleGroupItem: selected = violet
 * subtle (05 §4 selected state), unselected = outline.
 */
export function Chip({
  label,
  selected,
  onPress,
  role = 'checkbox',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'checkbox' | 'radio';
}) {
  return (
    <Pressable
      accessibilityRole={role}
      aria-checked={selected}
      onPress={onPress}
      className={`h-9 justify-center rounded-lg border px-3 ${
        selected ? 'border-primary-subtle bg-primary-subtle' : 'border-border bg-background active:bg-muted'
      }`}>
      <AppText weight="medium" className={`text-sm ${selected ? 'text-primary-subtle-foreground' : 'text-foreground'}`}>
        {label}
      </AppText>
    </Pressable>
  );
}
