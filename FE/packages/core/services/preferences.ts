import type { AppLocale } from '../i18n/locales';

/**
 * v1.1 (03 → Account settings, 04: PATCH /vendor-users/:id/preferences, /buyer-users/:id/preferences).
 * [assumed] The admin's language uses the same call with userType 'admin'.
 */
export interface PreferencesService {
  updateLocale(input: { userId: string; userType: 'vendor' | 'buyer' | 'admin'; locale: AppLocale }): Promise<void>;
}
