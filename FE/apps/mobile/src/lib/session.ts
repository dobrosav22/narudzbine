import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  createSessionStore,
  services,
  type KeyValueStorage,
  type SessionState,
  type SignedInState,
} from '@repo/core';

/** The token is a credential: Keychain / Keystore on device; localStorage for the web export (no SecureStore there). */
const nativeStorage: KeyValueStorage =
  Platform.OS === 'web'
    ? {
        getItem: async (k) => {
          try {
            return window.localStorage.getItem(k);
          } catch {
            return null;
          }
        },
        setItem: async (k, v) => {
          try {
            window.localStorage.setItem(k, v);
          } catch {
            // Session just won't survive a reload.
          }
        },
        removeItem: async (k) => {
          try {
            window.localStorage.removeItem(k);
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

/** Same store as apps/web — the logic lives in @repo/core. */
export const sessionStore = createSessionStore({
  storage: nativeStorage,
  auth: services.auth,
  buyerOrgs: services.buyerOrgs,
});

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState, sessionStore.getState);
}

/** For screens inside a signed-in Stack.Protected group. */
export function useSignedIn(): SignedInState {
  const state = useSession();
  if (state.status !== 'signedIn') throw new Error('useSignedIn used outside a signed-in route');
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
