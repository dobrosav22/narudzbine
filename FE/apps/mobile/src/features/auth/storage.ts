import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { emailChangeMemory, pendingInvitationStore, type KeyValueStorage } from '@repo/core';

/** Invitation tokens/proofs are capabilities: Keychain/Keystore on device (sessionStorage in the web preview). */
const secureStorage: KeyValueStorage =
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
            // Not kept across reloads.
          }
        },
        removeItem: async (k) => {
          try {
            window.sessionStorage.removeItem(k);
          } catch {
            // Nothing stored.
          }
        },
      }
    : {
        getItem: (k) => SecureStore.getItemAsync(k),
        setItem: (k, v) => SecureStore.setItemAsync(k, v),
        removeItem: (k) => SecureStore.deleteItemAsync(k),
      };

export const pendingInvitation = pendingInvitationStore(secureStorage);
export const emailChanges = emailChangeMemory(secureStorage);
