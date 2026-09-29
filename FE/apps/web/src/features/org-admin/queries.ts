"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadTeam,
  removeTeamMember,
  services,
  type Location,
  type LocationInput,
  type Membership,
  type NotificationChannel,
  type NotificationPreference,
  type NotificationType,
  type OrgType,
  type VendorLocation,
} from "@repo/core";
import { sessionStore } from "@/lib/session";

/**
 * Buyer locations reuse the key the cart/checkout/orders screens already read
 * (["buyerLocations", id]), so an edit here shows up there without extra wiring.
 */
export const adminKeys = {
  locations: (orgType: OrgType, orgId: string) => [orgType === "vendor" ? "vendorLocations" : "buyerLocations", orgId] as const,
  team: (orgId: string) => ["team", orgId] as const,
  buyerOrg: (orgId: string) => ["buyerOrg", orgId] as const,
  vendorOrg: (orgId: string) => ["vendorOrg", orgId] as const,
  prefs: (userId: string) => ["notificationPrefs", userId] as const,
};

type Org = Pick<Membership, "orgType"> & { orgId: string };

/** Vendor order screens label warehouses and buyer locations from this context. */
const invalidateOrderContext = (qc: ReturnType<typeof useQueryClient>, orgType: OrgType, orgId: string) =>
  orgType === "vendor" ? qc.invalidateQueries({ queryKey: ["vendorOrderContext", orgId] }) : qc.invalidateQueries({ queryKey: ["vendorOrderContext"] });

// ── Locations ────────────────────────────────────────────────────────────

export function useLocations({ orgType, orgId }: Org) {
  return useQuery({
    queryKey: adminKeys.locations(orgType, orgId),
    queryFn: (): Promise<(Location | VendorLocation)[]> =>
      orgType === "vendor" ? services.locations.listVendorLocations(orgId) : services.locations.listBuyerLocations(orgId),
  });
}

export function useSaveLocation({ orgType, orgId }: Org) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ locationId, input }: { locationId?: string; input: LocationInput }): Promise<Location | VendorLocation> => {
      if (orgType === "vendor")
        return locationId ? services.locations.updateVendorLocation(locationId, input) : services.locations.createVendorLocation(orgId, input);
      return locationId ? services.locations.updateBuyerLocation(locationId, input) : services.locations.createBuyerLocation(orgId, input);
    },
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: adminKeys.locations(orgType, orgId) }), invalidateOrderContext(qc, orgType, orgId)]),
  });
}

export function useDeleteLocation({ orgType, orgId }: Org) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locationId: string) =>
      orgType === "vendor" ? services.locations.deleteVendorLocation(locationId) : services.locations.deleteBuyerLocation(locationId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: adminKeys.locations(orgType, orgId) }),
        // A deleted home location is cleared on the users that had it.
        qc.invalidateQueries({ queryKey: adminKeys.team(orgId) }),
        invalidateOrderContext(qc, orgType, orgId),
        sessionStore.refresh(),
      ]),
  });
}

// ── Team ─────────────────────────────────────────────────────────────────

export function useTeam(membership: Membership) {
  return useQuery({ queryKey: adminKeys.team(membership.org.id), queryFn: () => loadTeam(services, membership) });
}

function useInvalidateTeam(membership: Membership) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: adminKeys.team(membership.org.id) }),
      qc.invalidateQueries({ queryKey: ["buyerUsers", membership.org.id] }),
      invalidateOrderContext(qc, membership.orgType, membership.org.id),
    ]);
}

export function useInviteTeammate(membership: Membership) {
  const invalidate = useInvalidateTeam(membership);
  return useMutation({
    mutationFn: (email: string) =>
      services.invites.createTeamInvite({ targetOrgId: membership.org.id, targetOrgType: membership.orgType, email }),
    onSuccess: () => invalidate(),
  });
}

export function useRevokeInvite(membership: Membership) {
  const invalidate = useInvalidateTeam(membership);
  return useMutation({ mutationFn: (inviteId: string) => services.invites.revoke(inviteId), onSuccess: () => invalidate() });
}

export function useRemoveMember(membership: Membership) {
  const invalidate = useInvalidateTeam(membership);
  return useMutation({ mutationFn: (userId: string) => removeTeamMember(services, membership, userId), onSuccess: () => invalidate() });
}

// ── Company ──────────────────────────────────────────────────────────────

export function useBuyerOrg(orgId: string) {
  return useQuery({ queryKey: adminKeys.buyerOrg(orgId), queryFn: () => services.buyerOrgs.getBuyerOrg(orgId) });
}

/** Name (both sides) and inventory tracking (vendors). The session holds the org name the shell shows, so it refreshes too. */
export function useUpdateCompany({ orgType, orgId }: Org) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name?: string; tracksInventory?: boolean }) =>
      orgType === "vendor" ? services.vendorOrgs.updateVendorOrg(orgId, patch) : services.buyerOrgs.updateBuyerOrg(orgId, { name: patch.name }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: orgType === "vendor" ? adminKeys.vendorOrg(orgId) : adminKeys.buyerOrg(orgId) }),
        // Tracking on/off adds or removes stock on every product and the dashboard's low-stock card.
        orgType === "vendor" ? qc.invalidateQueries({ queryKey: ["products", orgId] }) : undefined,
        orgType === "vendor" ? qc.invalidateQueries({ queryKey: ["orders", orgId] }) : undefined,
        orgType === "vendor" ? qc.invalidateQueries({ queryKey: ["buyerCatalogue", orgId] }) : undefined,
        sessionStore.refresh(),
      ]),
  });
}

// ── Account ──────────────────────────────────────────────────────────────

export function useUpdateProfile(email: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => services.auth.updateProfile({ email, name }),
    // The name shows in the shell, on teams and on order threads.
    onSuccess: () => Promise.all([sessionStore.refresh(), qc.invalidateQueries({ queryKey: ["team"] }), qc.invalidateQueries({ queryKey: ["vendorOrderContext"] })]),
  });
}

export function useChangePassword(email: string) {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      services.auth.changePassword({ email, currentPassword, newPassword }),
  });
}

export function useSetHomeLocation(membership: Membership) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locationId: string | null) => services.team.setHomeLocation(membership.user.id, locationId),
    onSuccess: () => Promise.all([sessionStore.refresh(), qc.invalidateQueries({ queryKey: adminKeys.team(membership.org.id) })]),
  });
}

export function useNotificationPrefs(membership: Membership) {
  return useQuery({
    queryKey: adminKeys.prefs(membership.user.id),
    queryFn: () => services.notifications.getPreferences(membership.user.id, membership.orgType),
  });
}

/** Optimistic: the switch flips at once and rolls back if the save fails. */
export function useTogglePreference(membership: Membership) {
  const qc = useQueryClient();
  const key = adminKeys.prefs(membership.user.id);
  return useMutation({
    mutationFn: (p: { notificationType: NotificationType; channel: NotificationChannel; enabled: boolean }) =>
      services.notifications.updatePreference({ userId: membership.user.id, userType: membership.orgType, ...p }),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NotificationPreference[]>(key);
      qc.setQueryData<NotificationPreference[]>(key, (prefs) =>
        prefs?.map((x) => (x.notificationType === p.notificationType && x.channel === p.channel ? { ...x, enabled: p.enabled } : x)),
      );
      return { previous };
    },
    onError: (_e, _p, ctx) => qc.setQueryData(key, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
