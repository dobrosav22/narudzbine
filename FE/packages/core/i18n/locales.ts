/**
 * UI languages (01 §12, 02 "Internationalization"): English and Serbian, Latin script only.
 * This is the UI language only — numbers, money and dates keep the regional LOCALE format
 * (config/env.ts, default bs-BA) whichever language is chosen.
 */
export type AppLocale = 'en' | 'sr-Latn';

export const DEFAULT_LOCALE: AppLocale = 'en';

/** For the language switcher: text labels, no flags (05 §6). Each name is written in its own language. */
export const SUPPORTED_LOCALES: readonly { value: AppLocale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'sr-Latn', label: 'Srpski' },
];

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'en' || value === 'sr-Latn';
}

/**
 * [assumed] The first-login guess from the browser/device language list (01 §12: "defaults to
 * the browser/device locale if it matches, else English"). Serbian in either script maps to
 * sr-Latn (the only Serbian we ship), and so do Bosnian, Croatian and Montenegrin — mutually
 * intelligible Latin-script neighbours, and a closer match for BAM-market users than English.
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
