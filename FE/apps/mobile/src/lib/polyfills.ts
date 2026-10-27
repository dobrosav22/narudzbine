// Runtime polyfills, imported first by the root layout before anything else runs.
//
// 1. Intl.PluralRules for ICU plural messages: Hermes may not ship it. Installs only when missing.
// 2. crypto.getRandomValues for client-generated UUIDv7 resource ids and UUIDv4 Idempotency-Keys
//    (@repo/core api/ids.ts). Hermes has no Web Crypto; expo-crypto supplies a CSPRNG.
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/sr.js';
import { getRandomValues } from 'expo-crypto';

const scope = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!scope.crypto?.getRandomValues) {
  scope.crypto = { ...(scope.crypto ?? {}), getRandomValues: getRandomValues as unknown };
}
