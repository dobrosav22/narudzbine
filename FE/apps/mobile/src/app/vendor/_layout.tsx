import { Stack } from 'expo-router';
import { useT } from '@/lib/i18n';

/** Vendor stack: the tab shell, with editors, details, stats and the plan picker pushed over it. */
export default function VendorStack() {
  const t = useT('m.nav');
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontFamily: 'Geist_600SemiBold' }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/new" options={{ title: t('newProduct') }} />
      <Stack.Screen name="product/[id]" options={{ title: t('editProduct') }} />
      <Stack.Screen name="order/[id]" options={{ title: t('order') }} />
      <Stack.Screen name="buyer/[id]" options={{ title: t('buyer') }} />
      <Stack.Screen name="stats" options={{ title: t('stats') }} />
      <Stack.Screen name="merchandising" options={{ title: t('merchandising') }} />
      <Stack.Screen name="profile" options={{ title: t('profile') }} />
      <Stack.Screen name="notifications" options={{ title: t('notifications') }} />
      <Stack.Screen name="company" options={{ title: t('company') }} />
      <Stack.Screen name="team" options={{ title: t('team') }} />
      <Stack.Screen name="locations" options={{ title: t('warehouses') }} />
      <Stack.Screen name="plan" options={{ title: t('plan') }} />
    </Stack>
  );
}
