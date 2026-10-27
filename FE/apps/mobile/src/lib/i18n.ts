import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import {
  api,
  data,
  DEFAULT_LOCALE,
  effectiveLocale,
  isAppLocale,
  matchLocale,
  MESSAGES,
  problemMsg,
  SUPPORTED_LOCALES,
  uiLocaleFor,
  type AppLocale,
  type Locale,
  type Messages,
  type Msg,
} from '@repo/core';
import { sessionStore, useSession } from '@/lib/session';

/*
 * Mobile i18n: i18next + ICU reading the shared key files in @repo/core/i18n, device language
 * from expo-localization. Signed in, the UI language follows the account's language override,
 * else the organization default; before login it's a guest choice (the language row on the
 * auth screens) or the device language. Components never branch on the locale — they call t().
 */

// Our own instance (not i18next's global default), so nothing else can change its language.
const i18n = createInstance();
void i18n.use(ICU).init({
  resources: Object.fromEntries(SUPPORTED_LOCALES.map((l) => [l.value, { translation: MESSAGES[l.value] }])),
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  // Resources are bundled, so init and every lookup are synchronous.
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

// ── Guest locale (no one signed in) ─────────────────────────────────────

const GUEST_KEY = 'narudzbine.locale';
let guest: AppLocale | undefined;
const listeners = new Set<() => void>();

/** Read the remembered guest choice once at startup (the root layout waits for it). */
export async function initGuestLocale(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(GUEST_KEY);
    if (isAppLocale(stored)) guest = stored;
  } catch {
    // No storage: the device language decides.
  }
  listeners.forEach((l) => l());
}

export function setGuestLocale(locale: AppLocale) {
  guest = locale;
  listeners.forEach((l) => l());
  void AsyncStorage.setItem(GUEST_KEY, locale).catch(() => undefined);
}

function useGuestLocale(): AppLocale | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => guest,
  );
}

/** The language the UI is in right now: the account's, else the guest's choice, else the device's. */
export function useUiLocale(): AppLocale {
  const session = useSession();
  const chosen = useGuestLocale();
  const device = useLocales();
  const backend = effectiveLocale(session);
  return backend ? uiLocaleFor(backend) : chosen ?? matchLocale(device.map((l) => l.languageTag));
}

/** Save the signed-in person's language override (null = follow the organization default). */
export async function changeLanguage(next: Locale | null): Promise<void> {
  const state = sessionStore.getState();
  if (state.status !== 'business' && state.status !== 'admin') return;
  const account = await data(api.PATCH('/me/language', { body: { expectedRevision: state.account.revision, languageOverride: next } }));
  sessionStore.update({ account });
}

// ── Translating ─────────────────────────────────────────────────────────

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Every translation key, as a full path ("cart.title"). Computed once; namespaces are slices of it. */
export type MessageKey = Leaves<Messages>;
/** Keys under a namespace, without its prefix: KeysIn<'cart'> = 'title' | 'emptyTitle' | … (never for an unknown namespace). */
type KeysIn<N extends string, K extends string = MessageKey> = K extends `${N}.${infer R}` ? R : never;
export type Values = Record<string, string | number>;

/** Rich-text tags the web renders as elements (e.g. <mono>); mobile shows their text plainly. */
const RICH_TAGS = /<\/?(?:mono|cart)>/g;

function translate(locale: AppLocale, key: string, values?: Values): string {
  return (i18n.getFixedT(locale)(key, values ?? {}) as string).replace(RICH_TAGS, '');
}

/**
 * `const t = useT('cart'); t('title')` — keys are checked against the English resources. Pass a namespace
 * for short keys; with none, keys are full paths ("common.save").
 */
export function useT<N extends string>(ns: N): (key: KeysIn<N>, values?: Values) => string;
export function useT(): (key: MessageKey, values?: Values) => string;
export function useT(ns?: string) {
  const locale = useUiLocale();
  return useCallback((key: string, values?: Values) => translate(locale, ns ? `${ns}.${key}` : key, values), [locale, ns]);
}

/** Translate a shared-code message descriptor (validation, descriptions, service errors). */
export function useMsg() {
  const locale = useUiLocale();
  return useCallback((m: Msg) => translate(locale, m.key, m.values), [locale]);
}

/** Any caught error as text in the UI language: the backend problem code's message, else by status. */
export function useErrorText() {
  const tm = useMsg();
  return useCallback((e: unknown): string => tm(problemMsg(e)), [tm]);
}
