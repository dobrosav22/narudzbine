import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Store } from 'lucide-react-native';
import { OptionRow } from '@/features/account/account-screen';
import { sessionStore, useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';

/** Vendor switcher modal — the single action that changes vendor context (02 → "State/context"). */
export default function SwitchVendor() {
  const c = useTokenColors();
  const { connectedVendors, activeVendor } = useSignedIn();
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4">
      <View className="overflow-hidden rounded-lg border border-border">
        {connectedVendors.map((v, i) => (
          <View key={v.id}>
            {i > 0 && <View className="h-px bg-border" />}
            <OptionRow
              icon={<Store size={18} color={c['muted-foreground']} />}
              title={v.name}
              selected={v.id === activeVendor?.id}
              onPress={() => void sessionStore.selectVendor(v.id).then(() => router.back())}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
