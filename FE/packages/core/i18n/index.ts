import en from './en.json';
import srLatn from './sr-Latn.json';
import type { AppLocale } from './locales';

export * from './locales';
export * from './message';

/**
 * The one set of translation files both apps read (02: never duplicate a translation into an
 * app-local file). ICU MessageFormat: next-intl on web, i18next + i18next-icu on mobile.
 */
export const MESSAGES: Record<AppLocale, typeof en> = { en, 'sr-Latn': srLatn as typeof en };
