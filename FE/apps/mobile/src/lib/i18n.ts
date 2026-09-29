import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import {
  DEFAULT_LOCALE,
  isAppLocale,
  isServiceError,
  matchLocale,
  MESSAGES,
  saveSessionLocale,
  services,
  sessionLocale,
  SUPPORTED_LOCALES,
  type AppLocale,
  type Msg,
} from '@repo/core';
import { sessionStore, useSession } from '@/lib/session';

/*
 * Mobile i18n (02 "Internationalization"): i18next + ICU reading the shared key files in
 * @repo/core/i18n, device language from expo-localization. The UI language is the signed-in
 * person's preferredLocale; before login it's a guest choice (the language row on the auth
 * screens) or the device language. Components never branch on the locale — they call t().
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

function setGuestLocale(locale: AppLocale) {
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

/** The language the UI is in right now: the person's choice, else the guest's, else the device's (01 §12). */
export function useUiLocale(): AppLocale {
  const session = useSession();
  const chosen = useGuestLocale();
  const device = useLocales();
  return sessionLocale(session) ?? chosen ?? matchLocale(device.map((l) => l.languageTag));
}

/** Switch language: saved on every user record of the signed-in person, else remembered on this device. */
export async function changeLocale(locale: AppLocale): Promise<void> {
  const state = sessionStore.getState();
  if (state.status === 'signedIn' || state.status === 'admin') {
    await saveSessionLocale(services, state, locale);
    await sessionStore.refresh();
  }
  setGuestLocale(locale);
}

// ── Translating ─────────────────────────────────────────────────────────

type Messages = (typeof MESSAGES)['en'];
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
 * `const t = useT('cart'); t('title')` — keys are checked against en.json. Pass a namespace
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

/** Any caught error as text in the UI language: translated service errors, else a generic line. */
export function useErrorText() {
  const tm = useMsg();
  return useCallback(
    (e: unknown): string => {
      if (isServiceError(e) && e.msg) return tm(e.msg);
      if (isServiceError(e, 'NOT_IMPLEMENTED')) return tm({ key: 'errors.notImplemented', values: { operation: String(e.details?.operation ?? '') } });
      // [assumed] A real backend's untranslated message is shown as-is rather than hidden.
      if (e instanceof Error && e.message) return e.message;
      return tm({ key: 'errors.unknown' });
    },
    [tm],
  );
}
