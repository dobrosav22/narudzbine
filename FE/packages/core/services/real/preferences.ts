import type { PreferencesService } from '../preferences';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline-v1.1.md (…/preferences).
export const preferencesService: PreferencesService = {
  updateLocale: async () => notImplemented('preferences.updateLocale'),
};
