import { Stack } from 'expo-router';
import { useT } from '@/lib/i18n';

/** Buyer stack: the tab shell, with details, checkout and account/company screens pushed over it. */
export default function BuyerStack() {
  const t = useT('shell.screens');
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontFamily: 'Geist_600SemiBold' }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: t('product') }} />
      <Stack.Screen name="checkout" options={{ title: t('checkout') }} />
      <Stack.Screen name="drafts" options={{ title: t('drafts') }} />
      <Stack.Screen name="order/[id]" options={{ title: t('order') }} />
      <Stack.Screen name="stats" options={{ title: t('stats') }} />
      <Stack.Screen name="vendors" options={{ title: t('vendors') }} />
      <Stack.Screen name="vendor/[id]" options={{ title: t('vendor') }} />
      <Stack.Screen name="profile" options={{ title: t('profile') }} />
      <Stack.Screen name="security" options={{ title: t('security') }} />
      <Stack.Screen name="notifications" options={{ title: t('notificationSettings') }} />
      <Stack.Screen name="inbox" options={{ title: t('inbox') }} />
      <Stack.Screen name="company" options={{ title: t('company') }} />
      <Stack.Screen name="team" options={{ title: t('team') }} />
      <Stack.Screen name="locations" options={{ title: t('buyerLocations') }} />
    </Stack>
  );
}
