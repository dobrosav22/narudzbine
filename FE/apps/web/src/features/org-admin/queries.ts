"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptOwnershipTransfer,
  allActiveLocations,
  archiveContact,
  archiveLocation,
  changeMemberRole,
  closeOrganization,
  createContact,
  createLocation,
  deactivateMember,
  inviteMember,
  organizationKeys,
  organizationQueries,
  reactivateMember,
  requestOwnershipTransfer,
  requestPrivacyCase,
  resendInvitation,
  restoreContact,
  restoreLocation,
  revokeInvitation,
  revokeOwnershipTransfer,
  updateContact,
  updateLocation,
  updateOrganization,
  type BusinessContact,
  type Contact,
  type ContactQuery,
  type InvitationQuery,
  type Location,
  type LocationFields,
  type LocationQuery,
  type MemberQuery,
  type OrganizationUpdate,
} from "@repo/core";
import { sessionStore } from "@/lib/session";

/** React Query wrappers for the own-organization factories in @repo/core. */

export function useOrganization() {
  return useQuery(organizationQueries.current());
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OrganizationUpdate) => updateOrganization(body),
    onSuccess: (organization) => {
      qc.setQueryData(organizationKeys.current(), organization);
      // The shell shows the name and the UI language may follow the default.
      sessionStore.update({ organization });
    },
  });
}

/** Guarded, owner only. Success signs this session out. */
export function useCloseOrganization() {
  return useMutation({
    mutationFn: ({ expectedRevision, reason }: { expectedRevision: string; reason: string }) => closeOrganization(expectedRevision, reason),
    onSuccess: () => sessionStore.expire(),
  });
}

// ── Members ──────────────────────────────────────────────────────────────

export function useMembers(q: MemberQuery) {
  return useQuery(organizationQueries.members(q));
}

function useInvalidateMembers() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["organization", "members"] }),
      qc.invalidateQueries({ queryKey: organizationKeys.latestTransfer() }),
    ]);
}

export function useChangeMemberRole() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ id, revision, role }: { id: string; revision: string; role: "ADMIN" | "STAFF" }) => changeMemberRole(id, revision, role),
    onSuccess: () => invalidate(),
  });
}

export function useDeactivateMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({ mutationFn: ({ id, revision }: { id: string; revision: string }) => deactivateMember(id, revision), onSuccess: () => invalidate() });
}

export function useReactivateMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({ mutationFn: ({ id, revision }: { id: string; revision: string }) => reactivateMember(id, revision), onSuccess: () => invalidate() });
}

// ── Invitations ──────────────────────────────────────────────────────────

export function useInvitations(q: InvitationQuery, enabled: boolean) {
  return useQuery({ ...organizationQueries.invitations(q), enabled });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: "ADMIN" | "STAFF" }) => inviteMember(email, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization", "invitations"] }),
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: revokeInvitation, onSuccess: () => qc.invalidateQueries({ queryKey: ["organization", "invitations"] }) });
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, revision, key }: { id: string; revision: string; key: string }) => resendInvitation(id, revision, key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization", "invitations"] }),
  });
}

// ── Ownership transfer ───────────────────────────────────────────────────

export function useLatestTransfer(enabled: boolean) {
  return useQuery({ ...organizationQueries.latestTransfer(), enabled });
}

export function useRequestTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipientId, orgRevision }: { recipientId: string; orgRevision: string }) => requestOwnershipTransfer(recipientId, orgRevision),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: organizationKeys.latestTransfer() }), sessionStore.refresh()]),
  });
}

export function useRevokeTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, revision }: { id: string; revision: string }) => revokeOwnershipTransfer(id, revision),
    onSuccess: () => qc.invalidateQueries({ queryKey: organizationKeys.latestTransfer() }),
  });
}

/** Both participants are signed out on success. */
export function useAcceptTransfer() {
  return useMutation({ mutationFn: ({ id, revision }: { id: string; revision: string }) => acceptOwnershipTransfer(id, revision) });
}

// ── Locations ────────────────────────────────────────────────────────────

export function useLocations(q: LocationQuery) {
  return useQuery(organizationQueries.locations(q));
}

export function useActiveLocations(enabled = true) {
  return useQuery({ ...allActiveLocations(), enabled });
}

function useInvalidateLocations() {
  const qc = useQueryClient();
  // Archiving clears home locations, so the own account may change too.
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["organization", "locations"] }), sessionStore.refresh()]);
}

export function useSaveLocation() {
  const invalidate = useInvalidateLocations();
  return useMutation({
    mutationFn: ({ id, existing, fields }: { id: string; existing?: Location; fields: LocationFields }) =>
      existing ? updateLocation(existing, fields) : createLocation(id, fields),
    onSuccess: () => invalidate(),
  });
}

export function useArchiveLocation() {
  const invalidate = useInvalidateLocations();
  return useMutation({
    mutationFn: ({ location, archive }: { location: Location; archive: boolean }) => (archive ? archiveLocation(location) : restoreLocation(location)),
    onSuccess: () => invalidate(),
  });
}

// ── Contacts ─────────────────────────────────────────────────────────────

export function useContacts(q: ContactQuery) {
  return useQuery(organizationQueries.contacts(q));
}

function useInvalidateContacts() {
  const qc = useQueryClient();
  // Archiving the shared contact clears it on the organization (and advances its revision).
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["organization", "contacts"] }), qc.invalidateQueries({ queryKey: organizationKeys.current() })]);
}

export function useSaveContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: ({ id, existing, label, contact }: { id: string; existing?: BusinessContact; label: string; contact: Contact }) =>
      existing ? updateContact(existing, label, contact) : createContact(id, label, contact),
    onSuccess: () => invalidate(),
  });
}

export function useArchiveContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: ({ contact, archive }: { contact: BusinessContact; archive: boolean }) => (archive ? archiveContact(contact) : restoreContact(contact)),
    onSuccess: () => invalidate(),
  });
}

// ── Audit and privacy ────────────────────────────────────────────────────

export function useAudit(action: string | null, enabled: boolean) {
  return useInfiniteQuery({ ...organizationQueries.audit(action), enabled });
}

export function usePrivacyCases(enabled: boolean) {
  return useQuery({ ...organizationQueries.privacyCases(), enabled });
}

export function usePrivacyExport(caseId: string, enabled: boolean) {
  return useQuery({ ...organizationQueries.privacyExport(caseId), enabled, retry: false });
}

export function useRequestPrivacyCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind, reason }: { id: string; kind: "EXPORT" | "REDACTION"; reason: string }) => requestPrivacyCase(id, kind, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: organizationKeys.privacyCases() }),
  });
}
