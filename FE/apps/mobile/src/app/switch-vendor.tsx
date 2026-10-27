import { ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Store } from 'lucide-react-native';
import { EmptyState, ErrorState, LoadingState } from '@/components/query-states';
import { OptionRow } from '@/features/buyer-catalogue/components';
import { useVendorContext } from '@/features/buyer-catalogue/vendor-context';
import { useT } from '@/lib/i18n';
import { sessionStore } from '@/lib/session';
import { useTokenColors } from '@/theme';

/** Vendor switcher modal — the single action that changes the buyer's vendor context. Each vendor keeps its own cart. */
export default function SwitchVendor() {
  const c = useTokenColors();
  const t = useT('browse');
  const { vendors, active, isPending, error, refetch } = useVendorContext();
  if (isPending) return <LoadingState label={t('loadingVendors')} />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4">
      <Stack.Screen options={{ title: t('switchVendor') }} />
      {vendors.length === 0 ? (
        <EmptyState title={t('noVendorsTitle')} description={t('noVendorsDescription')} />
      ) : (
        <View className="overflow-hidden rounded-lg border border-border" accessibilityRole="radiogroup">
          {vendors.map((v, i) => (
            <View key={v.vendorId}>
              {i > 0 && <View className="h-px bg-border" />}
              <OptionRow
                icon={<Store size={18} color={c['muted-foreground']} />}
                title={v.displayName}
                selected={v.vendorId === active?.vendorId}
                onPress={() => void sessionStore.selectVendor(v.vendorId).then(() => router.back())}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
