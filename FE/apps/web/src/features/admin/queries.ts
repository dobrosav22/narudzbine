"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { services, type ResolveUpgradeAction } from "@repo/core";

export const adminKeys = {
  all: ["admin"] as const,
  summary: ["admin", "summary"] as const,
  vendors: ["admin", "vendors"] as const,
  vendor: (id: string) => ["admin", "vendor", id] as const,
  buyers: ["admin", "buyers"] as const,
  buyer: (id: string) => ["admin", "buyer", id] as const,
  pending: ["admin", "requests", "pending"] as const,
  tiers: ["subscriptionTiers"] as const,
};

export const useAdminSummary = () => useQuery({ queryKey: adminKeys.summary, queryFn: () => services.admin.getPlatformSummary() });
export const useAdminVendors = () => useQuery({ queryKey: adminKeys.vendors, queryFn: () => services.admin.listVendorOrgs() });
export const useAdminVendor = (id: string) => useQuery({ queryKey: adminKeys.vendor(id), queryFn: () => services.admin.getVendorOrgDetail(id) });
export const useAdminBuyers = () => useQuery({ queryKey: adminKeys.buyers, queryFn: () => services.admin.listBuyerOrgs() });
export const useAdminBuyer = (id: string) => useQuery({ queryKey: adminKeys.buyer(id), queryFn: () => services.admin.getBuyerOrgDetail(id) });
export const usePendingRequests = () => useQuery({ queryKey: adminKeys.pending, queryFn: () => services.admin.listUpgradeRequests("pending") });
export const useTiers = () => useQuery({ queryKey: adminKeys.tiers, queryFn: () => services.subscription.listTiers() });

/**
 * Every admin write can move totals, rows and details, so all admin views refresh. The
 * vendor/buyer-side caches for the orgs involved refresh too (same tab while mocked).
 */
function useAdminMutation<V, R>(fn: (v: V) => Promise<R>, affected: (v: V) => { vendorOrgId?: string; buyerOrgId?: string }) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_r, v) => {
      const { vendorOrgId, buyerOrgId } = affected(v);
      return Promise.all([
        qc.invalidateQueries({ queryKey: adminKeys.all }),
        vendorOrgId ? qc.invalidateQueries({ queryKey: ["subscription", vendorOrgId] }) : undefined,
        vendorOrgId ? qc.invalidateQueries({ queryKey: ["buyerRows", vendorOrgId] }) : undefined,
        buyerOrgId ? qc.invalidateQueries({ queryKey: ["connectedVendors", buyerOrgId] }) : undefined,
      ]);
    },
  });
}

export const useSetTier = (vendorOrgId: string) =>
  useAdminMutation((tierId: string) => services.admin.setTier(vendorOrgId, tierId), () => ({ vendorOrgId }));

export const useResolveRequest = (vendorOrgId: string) =>
  useAdminMutation(
    ({ requestId, resolution }: { requestId: string; resolution: ResolveUpgradeAction }) => services.admin.resolveUpgradeRequest(requestId, resolution),
    () => ({ vendorOrgId }),
  );

export const useLink = () =>
  useAdminMutation(
    ({ vendorOrgId, buyerOrgId }: { vendorOrgId: string; buyerOrgId: string }) => services.admin.linkVendorBuyer(vendorOrgId, buyerOrgId),
    (v) => v,
  );

export const useUnlink = () =>
  useAdminMutation(
    ({ relationId }: { relationId: string; vendorOrgId: string; buyerOrgId: string }) => services.admin.unlinkVendorBuyer(relationId),
    ({ vendorOrgId, buyerOrgId }) => ({ vendorOrgId, buyerOrgId }),
  );
