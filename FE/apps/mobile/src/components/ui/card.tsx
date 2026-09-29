import { View } from 'react-native';
import { AppText } from '@/components/app-text';

/** Mirrors web's Card / CardHeader / CardTitle / CardDescription. */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={`gap-5 rounded-xl border border-border bg-card p-5 ${className ?? ''}`}>{children}</View>;
}

export function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <View className="gap-1">
      <AppText weight="semibold" className="text-xl text-card-foreground">
        {title}
      </AppText>
      {description && <AppText className="text-sm text-muted-foreground">{description}</AppText>}
    </View>
  );
}
