import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountKeys,
  accountQueries,
  cancelEmailChange,
  changePassword,
  completeEmailChange,
  deactivateSelf,
  markNotificationRead,
  notificationKeys,
  notificationQueries,
  removeDevice,
  requestEmailChange,
  revokeAllSessions,
  revokeSession,
  unlinkExternalIdentity,
  updateNotificationPreferences,
  updateProfile,
  type Notification,
  type Preference,
  type ProfileUpdate,
} from '@repo/core';
import { sessionStore } from '@/lib/session';

/** React Query wrappers for the own-account and notification factories in @repo/core. */

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdate) => updateProfile(body),
    onSuccess: (account) => {
      sessionStore.update({ account });
      // Member lists show names and home locations.
      void qc.invalidateQueries({ queryKey: ['organization', 'members'] });
    },
  });
}

/** The session result rotates this session's credential; other sessions are revoked. */
export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const result = await changePassword(newPassword);
      await sessionStore.adopt(result);
      return result;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions() }),
  });
}

export function useSessions() {
  return useQuery(accountQueries.sessions());
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: revokeSession, onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions() }) });
}

/** Signs out everywhere, this browser included. */
export function useRevokeAllSessions() {
  return useMutation({ mutationFn: revokeAllSessions, onSuccess: () => sessionStore.expire() });
}

export function useExternalIdentities() {
  return useQuery(accountQueries.externalIdentities());
}

/** Unlinking revokes every session; the person signs in again with a retained method. */
export function useUnlinkExternalIdentity() {
  return useMutation({ mutationFn: unlinkExternalIdentity, onSuccess: () => sessionStore.expire() });
}

export function useEmailChange(changeId: string | null) {
  return useQuery({ ...accountQueries.emailChange(changeId ?? ''), enabled: !!changeId });
}

export function useRequestEmailChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ newEmail, expectedRevision }: { newEmail: string; expectedRevision: string }) => requestEmailChange(newEmail, expectedRevision),
    onSuccess: (change) => qc.setQueryData(accountKeys.emailChange(change.id), change),
  });
}

export function useCancelEmailChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ changeId, expectedRevision }: { changeId: string; expectedRevision: string }) => cancelEmailChange(changeId, expectedRevision),
    onSuccess: (_r, { changeId }) => qc.invalidateQueries({ queryKey: accountKeys.emailChange(changeId) }),
  });
}

/** Success revokes every session: sign in again with the new address. */
export function useCompleteEmailChange() {
  return useMutation({
    mutationFn: ({ changeId, expectedRevision }: { changeId: string; expectedRevision: string }) => completeEmailChange(changeId, expectedRevision),
  });
}

/** STAFF only; the session ends. */
export function useDeactivateSelf() {
  return useMutation({ mutationFn: deactivateSelf, onSuccess: () => sessionStore.expire() });
}

// ── Notifications ────────────────────────────────────────────────────────

export function useNotificationPreferences() {
  return useQuery(notificationQueries.preferences());
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ expectedRevision, events }: { expectedRevision: string; events: Preference[] }) => updateNotificationPreferences(expectedRevision, events),
    onSuccess: (prefs) => qc.setQueryData(notificationKeys.preferences(), prefs),
  });
}

export function useInbox(unread: boolean | null) {
  return useInfiniteQuery(notificationQueries.inbox(unread));
}

/** Badge source; refreshed every minute while the shell is open. */
export function useUnreadNotifications(enabled = true) {
  return useQuery({ ...notificationQueries.unread(), enabled, refetchInterval: 60_000 });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notification: Notification) => markNotificationRead(notification.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useDevices() {
  return useQuery(notificationQueries.devices());
}

export function useRemoveDevice() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: removeDevice, onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.devices() }) });
}
