import { useState } from 'react';
import { Platform, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { base64Url, createPkceVerifier, EXTERNAL_PROVIDERS, exchangeExternalLogin, startExternalAuthentication, type ExternalProvider } from '@repo/core';
import { Button } from '@/components/ui/button';
import { FieldSeparator } from '@/components/ui/field';
import { sessionStore } from '@/lib/session';
import { useT } from '@/lib/i18n';
import { IdFormError } from './form-error';

/**
 * The HTTPS app link the backend redirects native external logins to (server-side configured,
 * X-02). Without it the buttons are hidden: there's nowhere to receive the one-use code.
 */
const RETURN_URL = process.env.EXPO_PUBLIC_EXTERNAL_AUTH_RETURN_URL;

/**
 * Native OIDC (Google/Apple LOGIN): S256 PKCE challenge → provider in an auth session →
 * app link with ?code&state → exchange code + verifier for a bearer session. Each attempt is a
 * fresh flow; a lost callback/exchange is never replayed.
 */
export function ExternalLogin() {
  const t = useT('auth');
  const [pending, setPending] = useState<ExternalProvider | null>(null);
  const [error, setError] = useState<unknown>(null);
  if (!RETURN_URL || Platform.OS === 'web') return null;

  async function start(provider: ExternalProvider) {
    setPending(provider);
    setError(null);
    try {
      const verifier = createPkceVerifier();
      const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new TextEncoder().encode(verifier));
      const challenge = await startExternalAuthentication({
        provider,
        purpose: 'LOGIN',
        transport: 'NATIVE',
        returnTarget: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
        codeChallenge: base64Url(new Uint8Array(digest)),
      });
      const expectedState = new URL(challenge.authorizationUrl).searchParams.get('state');
      const result = await WebBrowser.openAuthSessionAsync(challenge.authorizationUrl, RETURN_URL);
      if (result.type !== 'success') return;
      const params = new URL(result.url).searchParams;
      const code = params.get('code');
      // The app link must belong to the flow this device started.
      if (!code || (expectedState && params.get('state') !== expectedState)) return;
      await sessionStore.adopt(await exchangeExternalLogin(code, verifier));
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  return (
    <View className="gap-3">
      <FieldSeparator>{t('login.or')}</FieldSeparator>
      <IdFormError error={error} />
      {EXTERNAL_PROVIDERS.map((provider) => (
        <Button key={provider} variant="outline" loading={pending === provider} disabled={pending !== null} onPress={() => void start(provider)}>
          {t(`external.${provider}`)}
        </Button>
      ))}
    </View>
  );
}
