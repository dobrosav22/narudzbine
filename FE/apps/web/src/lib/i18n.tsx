"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import {
  isAppLocale,
  isServiceError,
  matchLocale,
  MESSAGES,
  saveSessionLocale,
  services,
  sessionLocale,
  type AppLocale,
  type Msg,
} from "@repo/core";
import { sessionStore, useSession } from "@/lib/session";

/*
 * Web i18n (02 "Internationalization"): next-intl reading the shared key files in
 * @repo/core/i18n. The UI language is the signed-in person's preferredLocale; before login
 * it's a guest choice (the language select on auth pages) or the browser's language.
 * Components never branch on the locale — they call t() / useMsg().
 */

const GUEST_KEY = "narudzbine.locale";
const listeners = new Set<() => void>();

function readGuest(): AppLocale | undefined {
  try {
    const stored = window.localStorage.getItem(GUEST_KEY);
    return isAppLocale(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** Browser guess, used until a guest picks a language or a user signs in (01 §12). */
function browserLocale(): AppLocale {
  return matchLocale(typeof navigator === "undefined" ? [] : [...(navigator.languages ?? []), navigator.language]);
}

export function setGuestLocale(locale: AppLocale) {
  try {
    window.localStorage.setItem(GUEST_KEY, locale);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  listeners.forEach((l) => l());
}

function useGuestLocale(): AppLocale {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readGuest() ?? browserLocale(),
    () => "en",
  );
}

/** The language the UI is in right now. */
export function useUiLocale(): AppLocale {
  const session = useSession();
  const guest = useGuestLocale();
  return sessionLocale(session) ?? guest;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useUiLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    // Dates/numbers are formatted by @repo/core (regional LOCALE), not next-intl; timeZone only silences its warning.
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Sarajevo">
      {children}
    </NextIntlClientProvider>
  );
}

/** Translate a shared-code message descriptor (validation, descriptions, service errors). */
export function useMsg() {
  const t = useTranslations();
  return useCallback((m: Msg) => (t as unknown as (k: string, v?: Msg["values"]) => string)(m.key, m.values), [t]);
}

/** Any caught error as text in the UI language: translated service errors, else a generic line. */
export function useErrorText() {
  const tm = useMsg();
  return useCallback(
    (e: unknown): string => {
      if (isServiceError(e) && e.msg) return tm(e.msg);
      if (isServiceError(e, "NOT_IMPLEMENTED")) return tm({ key: "errors.notImplemented", values: { operation: String(e.details?.operation ?? "") } });
      // [assumed] A real backend's untranslated message is shown as-is rather than hidden.
      if (e instanceof Error && e.message) return e.message;
      return tm({ key: "errors.unknown" });
    },
    [tm],
  );
}

/** Switch language: saved on every user record of the signed-in person, else remembered for this browser. */
export async function changeLocale(locale: AppLocale): Promise<void> {
  const state = sessionStore.getState();
  if (state.status === "signedIn" || state.status === "admin") {
    await saveSessionLocale(services, state, locale);
    await sessionStore.refresh();
  }
  setGuestLocale(locale);
}
