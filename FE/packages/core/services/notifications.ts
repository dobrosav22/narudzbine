import type { NotificationChannel, NotificationPreference, NotificationType } from '../types';

/** GET/PATCH /users/:id/notification-preferences */
export interface NotificationsService {
  /** Always returns the full type × channel matrix for the user's side. */
  getPreferences(userId: string, userType: 'vendor' | 'buyer'): Promise<NotificationPreference[]>;
  updatePreference(input: {
    userId: string;
    userType: 'vendor' | 'buyer';
    notificationType: NotificationType;
    channel: NotificationChannel;
    enabled: boolean;
  }): Promise<NotificationPreference>;
}
