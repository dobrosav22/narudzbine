import { api, data } from '../api/client';
import type { Device, DeviceInput, DeviceVerificationPending, Event, Notification, Preference, Preferences } from '../api/models';

/*
 * Own notification preferences, the private inbox and push device registrations. React-free.
 */

/** The six configurable ordinary events, in contract order. Security notices are mandatory and not listed. */
export const NOTIFICATION_EVENTS: readonly Event[] = [
  'ORDER_SUBMITTED',
  'ORDER_STATUS_CHANGED',
  'CANCELLATION_REQUESTED',
  'CANCELLATION_RESOLVED',
  'MESSAGE_CREATED',
  'RELATIONSHIP_DISCONNECTED',
];

export type NotificationChannel = 'inApp' | 'email' | 'push';
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['inApp', 'email', 'push'];

/** Contract defaults: in-app on, email and push off. */
export function defaultPreference(event: Event): Preference {
  return { event, inApp: true, email: false, push: false };
}

/**
 * The full replacement body for one toggled switch. PUT replaces the whole collection (omitted
 * events reset to defaults), so every current event is sent.
 */
export function togglePreference(current: Preferences, event: Event, channel: NotificationChannel, enabled: boolean): Preference[] {
  const byEvent = new Map(current.events.map((p) => [p.event, p]));
  return NOTIFICATION_EVENTS.map((e) => {
    const base = byEvent.get(e) ?? defaultPreference(e);
    return e === event ? { ...base, [channel]: enabled } : { ...base };
  });
}

/** Unread count shown on the inbox entry: exact up to one page, then "99+". */
export const UNREAD_PAGE_SIZE = 100;
export function unreadBadge(count: number, more: boolean): string | null {
  if (count === 0) return null;
  return more || count > 99 ? '99+' : String(count);
}

// ── Keys and queries ──────────────────────────────────────────────────────

export const notificationKeys = {
  all: ['notifications'] as const,
  preferences: () => ['notifications', 'preferences'] as const,
  inbox: (unread: boolean | null) => ['notifications', 'inbox', unread] as const,
  unread: () => ['notifications', 'unread'] as const,
  devices: () => ['notifications', 'devices'] as const,
};

export const notificationQueries = {
  preferences: () => ({ queryKey: notificationKeys.preferences(), queryFn: () => data(api.GET('/me/notification-preferences')) }),
  /** Cursor list; use with useInfiniteQuery. `unread` null lists both read and unread. */
  inbox: (unread: boolean | null) => ({
    queryKey: notificationKeys.inbox(unread),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      data(
        api.GET('/me/notifications', {
          params: { query: { size: 25, ...(unread === null ? {} : { unread }), ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor,
  }),
  /** There is no count endpoint: the first unread page (≤100) gives the badge. */
  unread: () => ({
    queryKey: notificationKeys.unread(),
    queryFn: async () => {
      const page = await data(api.GET('/me/notifications', { params: { query: { unread: true, size: UNREAD_PAGE_SIZE } } }));
      return { count: page.items.length, more: page.nextCursor !== null };
    },
  }),
  devices: () => ({
    queryKey: notificationKeys.devices(),
    queryFn: () => data(api.GET('/me/devices', { params: { query: { size: 100 } } })),
  }),
};

// ── Mutations ─────────────────────────────────────────────────────────────

export function updateNotificationPreferences(expectedRevision: string, events: Preference[]): Promise<Preferences> {
  return data(api.PUT('/me/notification-preferences', { body: { expectedRevision, events } }));
}

/** Desired state read=true; repeats are harmless. There is no mark-unread. */
export function markNotificationRead(notificationId: string): Promise<Notification> {
  return data(api.PUT('/me/notifications/{notificationId}/read', { params: { path: { notificationId } } }));
}

/**
 * Two-step registration: without verification fields the configured verifier answers 202 and
 * pushes a code to that exact token; repeat with verificationId/verificationCode to commit (201).
 * A backend without a trusted verifier answers 503.
 */
export async function registerDevice(input: DeviceInput): Promise<{ device: Device } | { pending: DeviceVerificationPending }> {
  const { data: body, response } = await api.POST('/me/devices', { body: input });
  return response.status === 202 ? { pending: body as DeviceVerificationPending } : { device: body as Device };
}

export async function removeDevice(deviceId: string): Promise<void> {
  await data(api.DELETE('/me/devices/{deviceId}', { params: { path: { deviceId } } }));
}
