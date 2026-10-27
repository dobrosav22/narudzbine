import { Stack } from 'expo-router';
import { useT } from '@/lib/i18n';
import { StatsScreen } from './vendor-stats-screen';

/** Buyer stats on mobile: this business's delivered purchases across all its vendors. */
export function BuyerStatsScreen() {
  const t = useT('stats');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <StatsScreen vendor={false} />
    </>
  );
}
