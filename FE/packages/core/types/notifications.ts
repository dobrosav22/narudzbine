// Mirrors 04-data-contract-api-outline.md → "Notifications".

export type NotificationType =
  | 'order_placed'
  | 'order_status_changed'
  | 'order_message_received'
  | 'invite_received'
  | 'promotion_pushed'
  | 'low_stock';

export type NotificationChannel = 'push' | 'email';

export interface NotificationPreference {
  userId: string;
  userType: 'vendor' | 'buyer';
  notificationType: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}
