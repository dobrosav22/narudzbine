import { View } from 'react-native';
import { router } from 'expo-router';
import { TriangleAlert } from 'lucide-react-native';
import { limitMessage, type PlanLimit, type VendorPlan } from '@repo/core';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/ui/button';
import { useTokenColors } from '@/theme';
import { useMsg, useT } from '@/lib/i18n';

/**
 * v1.1 hard block (01 §2) — mirrors web's PlanLimitNotice. Shown beside a disabled Add
 * Product / Invite control; the way forward is a plan request, never a self-serve change.
 */
export function PlanLimitNotice({ plan, limit }: { plan: VendorPlan; limit: PlanLimit }) {
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
          <AppText className="text-sm text-muted-foreground">{limitMessage(plan, limit).map(tm).join(' ')}</AppText>
        </View>
      </View>
      <Button size="sm" variant="outline" className="self-start" onPress={() => router.push('/vendor/plan')}>
        {t('link')}
      </Button>
    </View>
  );
}
