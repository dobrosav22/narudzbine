// Before anything formats a message or generates an id (Intl.PluralRules, crypto on Hermes).
import '@/lib/polyfills';
import '../global.css';

import { useEffect, useState } from 'react';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_600SemiBold } from '@expo-google-fonts/geist-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { QUERY_DEFAULTS } from '@repo/core';
import { sessionStore, useSession } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { ReauthProvider } from '@/features/auth/reauth';
import { initGuestLocale, useT } from '@/lib/i18n';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  const c = useTokenColors();
  const t = useT('shell');
  const session = useSession();
  const [localeReady, setLocaleReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_600SemiBold,
  });
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: QUERY_DEFAULTS }));

  useEffect(() => {
    void initGuestLocale().finally(() => setLocaleReady(true));
  }, []);

  useEffect(() => {
    void sessionStore.init();
    // Signing out (or a revoked session) must not leave the previous person's data in the cache.
    let wasSignedIn = false;
    return sessionStore.subscribe(() => {
      const status = sessionStore.getState().status;
      const signedIn = status === 'business' || status === 'admin';
      if (wasSignedIn && !signedIn) queryClient.clear();
      wasSignedIn = signedIn;
    });
  }, [queryClient]);

  // Hold the splash until fonts and the stored session are resolved — no login-screen flash.
  // A font failure falls back to the system font rather than blocking the app.
  const ready = (fontsLoaded || fontError !== null) && session.status !== 'loading' && localeReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  const orgType = session.status === 'business' ? session.organization.type : undefined;
  const base = dark ? DarkTheme : DefaultTheme;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        value={{
          ...base,
          colors: { ...base.colors, primary: c.primary, background: c.background, card: c.background, text: c.foreground, border: c.border },
        }}>
        <StatusBar style="auto" />
        <ReauthProvider>
        {/* A guard turning false (sign-out, revoked session) sends the user to `index`, which redirects by session. */}
        <Stack screenOptions={{ headerTitleStyle: { fontFamily: 'Geist_600SemiBold' }, headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          {/* A platform admin is neither signed out nor an org member: it lands on `index`, which explains the admin panel is web-only. */}
          <Stack.Protected guard={session.status === 'signedOut'}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={orgType === 'VENDOR'}>
            <Stack.Screen name="vendor" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={orgType === 'BUYER'}>
            <Stack.Screen name="buyer" options={{ headerShown: false }} />
            <Stack.Screen name="switch-vendor" options={{ presentation: 'modal', title: t('switchVendor') }} />
          </Stack.Protected>
          {/* Emailed-link flows work signed in or out (deep links: narudzbine://invitation?token=…). */}
          <Stack.Screen name="invitation" options={{ title: t('invitation') }} />
          <Stack.Screen name="email-proof" options={{ title: t('emailProof') }} />
        </Stack>
        </ReauthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
