"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminAssignPlan,
  adminChangeOrganizationState,
  adminConnect,
  adminCorrectOrganization,
  adminCreateRecoveryCase,
  adminCreateSupportAccess,
  adminDisconnect,
  adminInviteOrganization,
  adminKeys,
  adminQueries,
  adminResendInvitation,
  adminResolvePlanRequest,
  adminReviewRecoveryCase,
  adminRevokeInvitation,
  adminSetStaffActive,
  adminSupportQueries,
  SUPPORT_QUERY_OPTIONS,
  type AdminAuditQuery,
  type AdminMemberQuery,
  type AdminOrganizationQuery,
  type AdminPagedQuery,
  type AdminPlanRequestQuery,
  type AdminReportQuery,
  type Invitation,
  type Organization,
} from "@repo/core";

/*
 * React Query wrappers for the platform admin console. Factories and mutation functions live
 * in @repo/core (queries/admin.ts); this file only adds caching and invalidation.
 */

export const useAdminSummary = () => useQuery(adminQueries.summary());

export const useAdminOrganizations = (q: AdminOrganizationQuery, enabled = true) =>
  useQuery({ ...adminQueries.organizations(q), placeholderData: keepPreviousData, enabled });

export const useAdminOrganization = (id: string) => useQuery(adminQueries.organization(id));

/** Names for a handful of organization ids (plan requests, agreed prices); shares the detail cache. */
export function useAdminOrganizationNames(ids: string[]): Map<string, Organization> {
  const unique = [...new Set(ids)];
  const results = useQueries({ queries: unique.map((id) => ({ ...adminQueries.organization(id), staleTime: 5 * 60_000 })) });
  const out = new Map<string, Organization>();
  results.forEach((r) => r.data && out.set(r.data.id, r.data));
  return out;
}

export const useAdminMembers = (id: string, q: AdminMemberQuery) =>
  useQuery({ ...adminQueries.members(id, q), placeholderData: keepPreviousData });

export const useAdminVendorPlan = (vendorId: string, enabled = true) => useQuery({ ...adminQueries.vendorPlan(vendorId), enabled });

export const useAdminPlans = () => useQuery(adminQueries.plans());

export const useAdminPlanRequests = (q: AdminPlanRequestQuery) =>
  useQuery({ ...adminQueries.planRequests(q), placeholderData: keepPreviousData });

export const useAdminAudit = (q: AdminAuditQuery) =>
  useInfiniteQuery({
    ...adminQueries.audit(q),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useAdminInvitation = (id: string) => useQuery({ ...adminQueries.invitation(id), retry: false });
export const useAdminRecoveryCase = (id: string) => useQuery({ ...adminQueries.recoveryCase(id), retry: false });
export const useAdminPrivacyCase = (id: string) => useQuery({ ...adminQueries.privacyCase(id), retry: false, refetchOnWindowFocus: false });

// ---- Support reads (audited per successful read; never refetched in the background) ----

export const useSupportReport = (accessId: string, organizationId: string, q: AdminReportQuery) =>
  useQuery({ ...adminSupportQueries.report(accessId, organizationId, q), ...SUPPORT_QUERY_OPTIONS });

export const useSupportProducts = (accessId: string, organizationId: string, q: AdminPagedQuery) =>
  useQuery({ ...adminSupportQueries.products(accessId, organizationId, q), ...SUPPORT_QUERY_OPTIONS, placeholderData: keepPreviousData });

export const useSupportPricing = (accessId: string, productId: string) =>
  useQuery({ ...adminSupportQueries.pricing(accessId, productId), ...SUPPORT_QUERY_OPTIONS });

export const useSupportStock = (accessId: string, productId: string) =>
  useQuery({ ...adminSupportQueries.stock(accessId, productId), ...SUPPORT_QUERY_OPTIONS });

export const useSupportPromotions = (accessId: string, organizationId: string, q: AdminPagedQuery) =>
  useQuery({ ...adminSupportQueries.promotions(accessId, organizationId, q), ...SUPPORT_QUERY_OPTIONS, placeholderData: keepPreviousData });

export const useSupportAgreedPrices = (accessId: string, organizationId: string, q: AdminPagedQuery) =>
  useQuery({ ...adminSupportQueries.agreedPrices(accessId, organizationId, q), ...SUPPORT_QUERY_OPTIONS, placeholderData: keepPreviousData });

export const useSupportOrder = (accessId: string, orderId: string) =>
  useQuery({ ...adminSupportQueries.order(accessId, orderId), ...SUPPORT_QUERY_OPTIONS });

export const useSupportMessages = (accessId: string, orderId: string) =>
  useInfiniteQuery({
    ...adminSupportQueries.messages(accessId, orderId),
    ...SUPPORT_QUERY_OPTIONS,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

// ---- Mutations ----

function usePatchOrganization() {
  const qc = useQueryClient();
  return (org: Organization) => {
    qc.setQueryData(adminKeys.organization(org.id), org);
    void qc.invalidateQueries({ queryKey: ["admin", "organizations"] });
    void qc.invalidateQueries({ queryKey: adminKeys.summary() });
  };
}

export function useCorrectOrganization() {
  const patch = usePatchOrganization();
  return useMutation({ mutationFn: adminCorrectOrganization, onSuccess: patch });
}

export function useChangeOrganizationState() {
  const patch = usePatchOrganization();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminChangeOrganizationState,
    onSuccess: (org) => {
      patch(org);
      // Closure retires plan requests and memberships' sessions; refresh dependent views.
      void qc.invalidateQueries({ queryKey: ["admin", "planRequests"] });
      void qc.invalidateQueries({ queryKey: ["admin", "organization", org.id] });
    },
  });
}

export function useSetStaffActive(organizationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminSetStaffActive,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "organization", organizationId, "members"] });
      void qc.invalidateQueries({ queryKey: adminKeys.summary() });
    },
  });
}

export function useAssignPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminAssignPlan,
    onSuccess: (plan) => {
      qc.setQueryData(adminKeys.vendorPlan(plan.id), plan);
      // An actual change supersedes pending requests.
      void qc.invalidateQueries({ queryKey: ["admin", "planRequests"] });
      void qc.invalidateQueries({ queryKey: adminKeys.summary() });
    },
  });
}

export function useResolvePlanRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminResolvePlanRequest,
    onSuccess: (request) => {
      void qc.invalidateQueries({ queryKey: ["admin", "planRequests"] });
      void qc.invalidateQueries({ queryKey: adminKeys.vendorPlan(request.vendorId) });
      void qc.invalidateQueries({ queryKey: adminKeys.summary() });
    },
  });
}

export function useConnect() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: adminConnect, onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.summary() }) });
}

export function useDisconnect() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: adminDisconnect, onSuccess: () => void qc.invalidateQueries({ queryKey: adminKeys.summary() }) });
}

export function useInviteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminInviteOrganization,
    onSuccess: ({ invitation }) => qc.setQueryData(adminKeys.invitation(invitation.id), invitation),
  });
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminResendInvitation,
    onSuccess: (invitation: Invitation) => qc.setQueryData(adminKeys.invitation(invitation.id), invitation),
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminRevokeInvitation,
    onSuccess: (_void, id) => void qc.invalidateQueries({ queryKey: adminKeys.invitation(id) }),
  });
}

export const useCreateSupportAccess = () => useMutation({ mutationFn: adminCreateSupportAccess });

export function useCreateRecoveryCase() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: adminCreateRecoveryCase, onSuccess: (c) => qc.setQueryData(adminKeys.recoveryCase(c.id), c) });
}

export function useReviewRecoveryCase() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: adminReviewRecoveryCase, onSuccess: (c) => qc.setQueryData(adminKeys.recoveryCase(c.id), c) });
}
