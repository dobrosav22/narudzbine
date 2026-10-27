import { Stack } from 'expo-router';
import { useT } from '@/lib/i18n';

/** Signed-out screens: login and password reset. */
export default function AuthLayout() {
  const t = useT('auth');
  return (
    <Stack screenOptions={{ headerTitleStyle: { fontFamily: 'Geist_600SemiBold' }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="login" options={{ title: 'Narudžbine' }} />
      <Stack.Screen name="forgot-password" options={{ title: t('forgot.title') }} />
      <Stack.Screen name="reset-password" options={{ title: t('reset.title') }} />
    </Stack>
  );
}
