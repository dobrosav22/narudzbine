import { orderStateTone, type OrderState } from '@repo/core';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';

/** Core lifecycle state plus the optional custom stage label inside ACCEPTED (mirrors web). */
export function OrderStateBadge({ state, stageName }: { state: OrderState; stageName?: string | null }) {
  const t = useT('ordState');
  const label = state === 'ACCEPTED' && stageName ? t('withStage', { state: t(state), stage: stageName }) : t(state);
  return <Badge variant={orderStateTone(state)}>{label}</Badge>;
}
