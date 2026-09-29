import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services, type PromotionFields } from '@repo/core';

export const merchKeys = {
  featured: (vendorOrgId: string) => ['featured', vendorOrgId] as const,
  promotions: (vendorOrgId: string) => ['promotions', vendorOrgId] as const,
};

/** Featured order and promotions change what buyers see, so every write refreshes the buyer catalogue too. */
function useInvalidateBuyerSide(vendorOrgId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['buyerCatalogue', vendorOrgId] });
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

/** Mobile only pauses/resumes (patch); creating and editing promotions is web-only. */
export function useUpdatePromotion(vendorOrgId: string) {
  const qc = useQueryClient();
  const invalidateBuyers = useInvalidateBuyerSide(vendorOrgId);
  return useMutation({
    mutationFn: ({ promotionId, fields }: { promotionId: string; fields: Partial<PromotionFields> }) =>
      services.merchandising.updatePromotion(promotionId, fields),
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
