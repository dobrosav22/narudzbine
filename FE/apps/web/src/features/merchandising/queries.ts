"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { services, type PromotionFields } from "@repo/core";

export const merchKeys = {
  featured: (vendorOrgId: string) => ["featured", vendorOrgId] as const,
  promotions: (vendorOrgId: string) => ["promotions", vendorOrgId] as const,
};

/**
 * Featured order and promotions both change what buyers see (the home shelf, every
 * resolved price), so each write also refreshes the buyer catalogue for this vendor.
 */
function useInvalidateBuyerSide(vendorOrgId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["buyerCatalogue", vendorOrgId] });
}

export function useFeatured(vendorOrgId: string) {
  return useQuery({ queryKey: merchKeys.featured(vendorOrgId), queryFn: () => services.merchandising.listFeatured(vendorOrgId) });
}

export function useSetFeatured(vendorOrgId: string) {
  const qc = useQueryClient();
  const invalidateBuyers = useInvalidateBuyerSide(vendorOrgId);
  return useMutation({
    mutationFn: (productIds: string[]) => services.merchandising.setFeatured(vendorOrgId, productIds),
    onSuccess: (featured) => {
      qc.setQueryData(merchKeys.featured(vendorOrgId), featured);
      return invalidateBuyers();
    },
  });
}

export function usePromotions(vendorOrgId: string) {
  return useQuery({ queryKey: merchKeys.promotions(vendorOrgId), queryFn: () => services.merchandising.listPromotions(vendorOrgId) });
}

/** Create when `promotionId` is absent, otherwise patch. */
export function useSavePromotion(vendorOrgId: string) {
  const qc = useQueryClient();
  const invalidateBuyers = useInvalidateBuyerSide(vendorOrgId);
  return useMutation({
    mutationFn: ({ promotionId, fields }: { promotionId?: string; fields: Partial<PromotionFields> }) =>
      promotionId
        ? services.merchandising.updatePromotion(promotionId, fields)
        : services.merchandising.createPromotion({ vendorOrgId, ...(fields as PromotionFields) }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: merchKeys.promotions(vendorOrgId) }), invalidateBuyers()]),
  });
}

export function useDeletePromotion(vendorOrgId: string) {
  const qc = useQueryClient();
  const invalidateBuyers = useInvalidateBuyerSide(vendorOrgId);
  return useMutation({
    mutationFn: (promotionId: string) => services.merchandising.deletePromotion(promotionId),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: merchKeys.promotions(vendorOrgId) }), invalidateBuyers()]),
  });
}
