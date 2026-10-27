import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import {
  API_BASE_URL,
  bearerReader,
  configureApi,
  createSessionStore,
  setDisplayCountry,
  type BusinessState,
  type KeyValueStorage,
  type SessionState,
} from '@repo/core';

/**
 * The bearer is a credential: Keychain / Keystore on device. The Expo web export (tests only)
 * has no SecureStore and keeps it in sessionStorage for the tab's lifetime.
 */
const nativeStorage: KeyValueStorage =
  Platform.OS === 'web'
    ? {
        getItem: async (k) => {
          try {
            return window.sessionStorage.getItem(k);
          } catch {
            return null;
          }
        },
        setItem: async (k, v) => {
          try {
            window.sessionStorage.setItem(k, v);
          } catch {
            // Session just won't survive a reload.
          }
        },
        removeItem: async (k) => {
          try {
            window.sessionStorage.removeItem(k);
          } catch {
            // Nothing to clean up.
          }
        },
      }
    : {
        getItem: (k) => SecureStore.getItemAsync(k),
        setItem: (k, v) => SecureStore.setItemAsync(k, v),
        removeItem: (k) => SecureStore.deleteItemAsync(k),
      };

/** "Pixel 8 (Android)" style label for the sessions list. */
function deviceLabel(): string {
  const model = Device.modelName ?? Device.deviceName ?? 'Phone';
  return Platform.OS === 'web' ? 'Mobile web preview' : `${model} (${Platform.OS === 'ios' ? 'iOS' : 'Android'})`;
}

/** Same store as apps/web — the logic lives in @repo/core. */
export const sessionStore = createSessionStore({ storage: nativeStorage, deviceLabel });

// Native transport: opaque bearer from secure storage; never cookies, Origin or CSRF.
configureApi({
  baseUrl: API_BASE_URL,
  transport: 'NATIVE',
  getBearer: bearerReader(nativeStorage),
  onUnauthenticated: () => {
    if (sessionStore.getState().status !== 'signedOut') void sessionStore.expire();
  },
});
sessionStore.subscribe(() => {
  const state = sessionStore.getState();
  if (state.status === 'business') setDisplayCountry(state.organization.country);
});

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState, sessionStore.getState);
}

/** For screens inside a business Stack.Protected group. */
export function useBusiness(): BusinessState {
  const state = useSession();
  if (state.status !== 'business') throw new Error('useBusiness used outside a business route');
  return state;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
