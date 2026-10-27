import { View } from 'react-native';
import { router } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { limitMsgs, type PlanLimitKind, type VendorPlan } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { useTokenColors } from '@/theme';
import { useMsg, useT } from '@/lib/i18n';

/**
 * Mirrors web's PlanLimitNotice: shown at a plan cap or after 409 PLAN_LIMIT_EXCEEDED. Message +
 * link to the plan screen only; plan changes are requests a platform admin approves.
 */
export function PlanLimitNotice({ limit, plan }: { limit: PlanLimitKind; plan?: VendorPlan | null }) {
  const c = useTokenColors();
  const t = useT('planLimit');
  const tm = useMsg();
  return (
    <View accessibilityRole="alert" className="gap-3 rounded-lg border border-border bg-card p-4">
      <View className="flex-row gap-2">
        <TriangleAlert size={18} color={c.foreground} />
        <View className="flex-1 gap-1">
          <AppText weight="medium" className="text-sm text-foreground">
            {t(limit === 'products' ? 'titleProducts' : 'titleBuyers')}
          </AppText>
          <AppText className="text-sm text-muted-foreground">
            {plan ? limitMsgs(plan, limit).map(tm).join(' ') : t(limit === 'products' ? 'genericProducts' : 'genericBuyers')}
          </AppText>
        </View>
      </View>
      <Button size="sm" variant="outline" className="self-start" onPress={() => router.push('/vendor/plan')}>
        {t('link')}
      </Button>
    </View>
  );
}
