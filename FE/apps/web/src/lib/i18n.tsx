"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import {
  api,
  data,
  effectiveLocale,
  isAppLocale,
  matchLocale,
  MESSAGES,
  problemMsg,
  uiLocaleFor,
  type AppLocale,
  type Locale,
  type Msg,
} from "@repo/core";
import { sessionStore, useSession } from "@/lib/session";

/*
 * Web i18n: next-intl reading the shared key files in @repo/core/i18n. Signed in, the UI
 * language follows the account's language override, else the organization default. Before
 * login it's a guest choice (the language select on auth pages) or the browser's language.
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
  const backend = effectiveLocale(session);
  return backend ? uiLocaleFor(backend) : guest;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useUiLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    // Dates/numbers are formatted by @repo/core (country region), not next-intl; timeZone only silences its warning.
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Belgrade">
      {children}
    </NextIntlClientProvider>
  );
}

/** Translate a shared-code message descriptor (validation, problems, descriptions). */
export function useMsg() {
  const t = useTranslations();
  return useCallback((m: Msg) => (t as unknown as (k: string, v?: Msg["values"]) => string)(m.key, m.values), [t]);
}

/** Any caught error as text in the UI language: the backend problem code's message, else by status. */
export function useErrorText() {
  const tm = useMsg();
  return useCallback((e: unknown): string => tm(problemMsg(e)), [tm]);
}

/**
 * Save the signed-in person's language override (null = follow the organization default);
 * guests just remember a UI language in this browser.
 */
export async function changeLanguage(next: Locale | null): Promise<void> {
  const state = sessionStore.getState();
  if (state.status !== "business" && state.status !== "admin") return;
  const account = await data(
    api.PATCH("/me/language", { body: { expectedRevision: state.account.revision, languageOverride: next } }),
  );
  sessionStore.update({ account });
}
