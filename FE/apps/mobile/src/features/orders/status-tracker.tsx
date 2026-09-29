import { View } from 'react-native';
import { Check, XCircle } from 'lucide-react-native';
import { statusLabel, trackerView, type VendorOrderStatusConfig } from '@repo/core';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';
import { useMsg, useT } from '@/lib/i18n';

/** Vertical tracker from the vendor's configured statuses — no hardcoded stepper (01 §5). Buyer and vendor screens. */
export function StatusTracker({ config, statusKey }: { config: VendorOrderStatusConfig; statusKey: string }) {
  const c = useTokenColors();
  const t = useT('orders');
  const tm = useMsg();
  const view = trackerView(config, statusKey);
  if (view.cancelled) {
    return (
      <View accessibilityRole="alert" className="flex-row gap-2 rounded-lg border border-border bg-card p-3">
        <XCircle size={18} color={c.destructive} />
        <View className="flex-1 gap-0.5">
          <AppText weight="medium" className="text-sm text-destructive">
            {tm(statusLabel(view.cancelled))}
          </AppText>
          <AppText className="text-sm text-muted-foreground">{t('cancelledNote')}</AppText>
        </View>
      </View>
    );
  }
  return (
    <View className="gap-0" accessibilityLabel={t('progress')}>
      {view.steps.map(({ status, state }, i) => (
        <View key={status.key} className="flex-row gap-3" aria-current={state === 'current' ? 'step' : undefined}>
          <View className="items-center">
            <View
              className={`size-7 items-center justify-center rounded-full border ${
                state === 'done' ? 'border-success bg-success' : state === 'current' ? 'border-success' : 'border-border'
              }`}>
              {state === 'done' ? (
                <Check size={14} color={c['success-foreground']} />
              ) : (
                <AppText className={`text-xs ${state === 'current' ? 'text-success' : 'text-muted-foreground'}`}>{String(i + 1)}</AppText>
              )}
            </View>
            {i < view.steps.length - 1 && <View className={`h-5 w-px ${state === 'done' ? 'bg-success' : 'bg-border'}`} />}
          </View>
          <AppText weight={state === 'upcoming' ? 'regular' : 'medium'} className={`pt-1 text-sm ${state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'}`}>
            {tm(statusLabel(status))}
          </AppText>
        </View>
      ))}
    </View>
  );
}
