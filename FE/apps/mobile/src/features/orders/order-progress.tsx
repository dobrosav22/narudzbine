import { View } from 'react-native';
import { Check, XCircle } from 'lucide-react-native';
import { orderProgress, type OrderState } from '@repo/core';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';

/** Vertical fixed lifecycle tracker; the custom stage is a label under Accepted (mirrors web). */
export function OrderProgress({ state, stageName, endedNote }: { state: OrderState; stageName: string | null; endedNote: string }) {
  const c = useTokenColors();
  const t = useT('ordState');
  const view = orderProgress(state);
  if (view.ended) {
    return (
      <View accessibilityRole="alert" className="flex-row gap-2 rounded-lg border border-border bg-card p-3">
        <XCircle size={18} color={c.destructive} />
        <View className="flex-1 gap-0.5">
          <AppText weight="medium" className="text-sm text-destructive">
            {t(view.ended)}
          </AppText>
          <AppText className="text-sm text-muted-foreground">{endedNote}</AppText>
        </View>
      </View>
    );
  }
  return (
    <View accessibilityLabel={t('progress')}>
      {view.steps.map(({ state: step, progress }, i) => (
        <View key={step} className="flex-row gap-3" aria-current={progress === 'current' ? 'step' : undefined}>
          <View className="items-center">
            <View
              className={`size-7 items-center justify-center rounded-full border ${
                progress === 'done' ? 'border-success bg-success' : progress === 'current' ? 'border-success' : 'border-border'
              }`}>
              {progress === 'done' ? (
                <Check size={14} color={c['success-foreground']} />
              ) : (
                <AppText className={`text-xs ${progress === 'current' ? 'text-success' : 'text-muted-foreground'}`}>{String(i + 1)}</AppText>
              )}
            </View>
            {i < view.steps.length - 1 && <View className={`h-5 w-px ${progress === 'done' ? 'bg-success' : 'bg-border'}`} />}
          </View>
          <View className="pt-1">
            <AppText weight={progress === 'upcoming' ? 'regular' : 'medium'} className={`text-sm ${progress === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'}`}>
              {t(`step.${step}`)}
            </AppText>
            {step === 'ACCEPTED' && progress === 'current' && stageName ? (
              <AppText className="text-xs text-muted-foreground">{stageName}</AppText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
