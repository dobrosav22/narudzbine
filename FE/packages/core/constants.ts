import type { NotificationType, OrderStatus } from './types';

/** [assumed] Stock at or below this counts as "low" for alerts when inventory tracking is on. */
export const LOW_STOCK_THRESHOLD = 20;

/** 01 §5 — what a vendor gets on signup; editable afterwards. */
export const DEFAULT_ORDER_STATUSES: OrderStatus[] = [
  { key: 'placed', label: 'Placed', isTerminal: false, isCancelled: false },
  { key: 'confirmed', label: 'Confirmed', isTerminal: false, isCancelled: false },
  { key: 'fulfilled', label: 'Fulfilled', isTerminal: true, isCancelled: false },
  { key: 'cancelled', label: 'Cancelled', isTerminal: true, isCancelled: true },
];

/** Which notification types make sense for each side (01 §8). [assumed] split. */
export const NOTIFICATION_TYPES_BY_SIDE: Record<'vendor' | 'buyer', NotificationType[]> = {
  vendor: ['order_placed', 'order_message_received', 'invite_received', 'low_stock'],
  buyer: ['order_status_changed', 'order_message_received', 'invite_received', 'promotion_pushed'],
};

// Notification type names/descriptions: i18n → notificationTypes.<type>.label|description.
