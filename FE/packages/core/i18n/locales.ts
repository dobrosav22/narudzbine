import type { Locale } from '../api/models';

/**
 * UI resource languages shipped by the frontend: English and Serbian (Latin, Ekavian).
 * The backend's account/organization languages are en, sr-Latn-RS and bs-Latn-BA; Bosnian has no
 * UI resources yet and renders with the Serbian Latin strings (docs/frontend/backend-gaps.md). Numbers,
 * money and dates follow the organization country (format.ts), whichever language is chosen.
 */
export type AppLocale = 'en' | 'sr-Latn';

export const DEFAULT_LOCALE: AppLocale = 'en';

/** For the language switcher: text labels, no flags. Each name is written in its own language. */
export const SUPPORTED_LOCALES: readonly { value: AppLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'sr-Latn', label: 'Srpski' },
];

/** Backend language preferences (Account.languageOverride / Organization.defaultLanguage). */
export const BACKEND_LOCALES: readonly { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'sr-Latn-RS', label: 'Srpski (latinica)' },
  { value: 'bs-Latn-BA', label: 'Bosanski (latinica)' },
];

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'en' || value === 'sr-Latn';
}

export function isBackendLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'sr-Latn-RS' || value === 'bs-Latn-BA';
}

/** Which UI resources render a backend language. */
export function uiLocaleFor(locale: Locale | null | undefined): AppLocale {
  return locale === 'sr-Latn-RS' || locale === 'bs-Latn-BA' ? 'sr-Latn' : 'en';
}

/**
 * The pre-login guess from the browser/device language list: Serbian in either script and its
 * Latin-script neighbours (Bosnian, Croatian, Montenegrin) map to sr-Latn; anything else English.
 */
export function matchLocale(tags: readonly (string | null | undefined)[]): AppLocale {
  for (const tag of tags) {
    const lang = tag?.toLowerCase().split(/[-_]/)[0];
    if (!lang) continue;
    if (lang === 'en') return 'en';
    if (lang === 'sr' || lang === 'bs' || lang === 'hr' || lang === 'cnr' || lang === 'sh') return 'sr-Latn';
  }
  return DEFAULT_LOCALE;
}
