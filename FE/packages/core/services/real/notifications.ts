import type { NotificationsService } from '../notifications';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const notificationsService: NotificationsService = {
  getPreferences: async () => notImplemented('notifications.getPreferences'),
  updatePreference: async () => notImplemented('notifications.updatePreference'),
};
