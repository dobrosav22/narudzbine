import type { NotificationsService } from '../services';
import type { NotificationChannel, NotificationPreference } from '../types';
import { NOTIFICATION_TYPES_BY_SIDE } from '../constants';
import { db } from './db';
import { clone, delay } from './util';

const CHANNELS: NotificationChannel[] = ['push', 'email'];

export const notificationsService: NotificationsService = {
  async getPreferences(userId, userType) {
    await delay();
    const matrix: NotificationPreference[] = [];
    for (const notificationType of NOTIFICATION_TYPES_BY_SIDE[userType]) {
      for (const channel of CHANNELS) {
        const stored = db.notificationPrefs.find(
          (p) => p.userId === userId && p.notificationType === notificationType && p.channel === channel,
        );
        // Default: everything on until the user opts out [assumed].
        matrix.push(stored ? clone(stored) : { userId, userType, notificationType, channel, enabled: true });
      }
    }
    return matrix;
  },
  async updatePreference(input) {
    await delay(120);
    const existing = db.notificationPrefs.find(
      (p) => p.userId === input.userId && p.notificationType === input.notificationType && p.channel === input.channel,
    );
    if (existing) existing.enabled = input.enabled;
    else db.notificationPrefs.push({ ...input });
    return clone({ ...input });
  },
};
