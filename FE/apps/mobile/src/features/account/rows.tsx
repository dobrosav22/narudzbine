import { Children } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Check, ChevronRight } from 'lucide-react-native';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';

/** Grouped list rows shared by the account and organization screens (mirrors iOS settings lists). */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <AppText weight="medium" className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </AppText>
      {/* Rows are separated by explicit dividers (no reliance on last: variants on native). */}
      <View className="overflow-hidden rounded-lg border border-border">
        {Children.toArray(children).map((child, i) => (
          <View key={i}>
            {i > 0 && <View className="h-px bg-border" />}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

export function NavRow({
  icon,
  title,
  subtitle,
  href,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  href: Href;
  badge?: string | null;
}) {
  const c = useTokenColors();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} className="flex-row items-center gap-3 bg-background p-3 active:bg-muted">
      {icon}
      <View className="flex-1 gap-0.5">
        <AppText weight="medium" className="text-base text-foreground">
          {title}
        </AppText>
        {subtitle && <AppText className="text-xs text-muted-foreground">{subtitle}</AppText>}
      </View>
      {badge && (
        <View className="min-w-6 items-center rounded-full bg-primary px-2 py-0.5">
          <AppText weight="medium" className="text-xs text-primary-foreground">
            {badge}
          </AppText>
        </View>
      )}
      <ChevronRight size={18} color={c['muted-foreground']} />
    </Pressable>
  );
}

export function OptionRow({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const c = useTokenColors();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'radio' : undefined}
      aria-checked={onPress ? !!selected : undefined}
      className={`flex-row items-center gap-3 p-3 ${
        selected ? 'bg-primary-subtle' : 'bg-background active:bg-muted'
      }`}>
      {icon}
      <View className="flex-1 gap-0.5">
        <AppText weight="medium" className={`text-base ${selected ? 'text-primary-subtle-foreground' : 'text-foreground'}`}>
          {title}
        </AppText>
        {subtitle && <AppText className="text-xs text-muted-foreground">{subtitle}</AppText>}
      </View>
      {selected && <Check size={18} color={c['primary-subtle-foreground']} />}
    </Pressable>
  );
}
