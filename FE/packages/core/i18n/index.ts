import { en, srLatn } from './resources.gen';
import type { AppLocale } from './locales';

export * from './locales';
export * from './message';
export * from './problem';

export type Messages = typeof en;

/**
 * The one set of translation files both apps read (never duplicate a translation into an
 * app-local file). ICU MessageFormat: next-intl on web, i18next + i18next-icu on mobile.
 * Files live in messages/<language>/<namespace>.json; resources.gen.ts assembles them.
 */
// Key parity between languages is enforced by messages.test.ts, not by this cast.
export const MESSAGES: Record<AppLocale, Messages> = { en, 'sr-Latn': srLatn as unknown as Messages };
