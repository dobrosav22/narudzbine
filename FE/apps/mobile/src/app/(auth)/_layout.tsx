import { Stack } from 'expo-router';
import { View } from 'react-native';
import { USE_MOCKS } from '@repo/core';
import { AppText } from '@/components/app-text';
import { useT } from '@/lib/i18n';

function MockBadge() {
  const t = useT('common');
  return (
    <View className="rounded-full border border-border px-2 py-0.5">
      <AppText weight="medium" className="text-xs text-foreground">
        {t('mockData')}
      </AppText>
    </View>
  );
}

export default function AuthLayout() {
  const t = useT('m.nav');
  return (
    <Stack
      screenOptions={{
        headerTitleStyle: { fontFamily: 'Geist_600SemiBold' },
        headerRight: USE_MOCKS ? () => <MockBadge /> : undefined,
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen name="login" options={{ title: 'Narudžbine' }} />
      <Stack.Screen name="register" options={{ title: t('register') }} />
    </Stack>
  );
}
