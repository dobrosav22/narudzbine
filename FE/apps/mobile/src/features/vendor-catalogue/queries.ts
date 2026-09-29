import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadVendorPlan, services, type BuyerProductPrice, type PriceTierInput, type ProductFormValues } from '@repo/core';

/** Same key shapes as apps/web's vendor-catalogue/queries.ts. */
export const keys = {
  vendorOrg: (vendorOrgId: string) => ['vendorOrg', vendorOrgId] as const,
  products: (vendorOrgId: string) => ['products', vendorOrgId] as const,
  product: (productId: string) => ['product', productId] as const,
  priceTiers: (productId: string) => ['priceTiers', productId] as const,
  buyerOverrides: (vendorOrgId: string, productId: string) => ['buyerOverrides', vendorOrgId, productId] as const,
  buyerConnections: (vendorOrgId: string) => ['buyerConnections', vendorOrgId] as const,
  categories: (vendorOrgId: string) => ['categories', vendorOrgId] as const,
  tags: (vendorOrgId: string) => ['tags', vendorOrgId] as const,
  subscription: (vendorOrgId: string) => ['subscription', vendorOrgId] as const,
};

export function useVendorOrg(vendorOrgId: string) {
  return useQuery({ queryKey: keys.vendorOrg(vendorOrgId), queryFn: () => services.vendorOrgs.getVendorOrg(vendorOrgId) });
}

export function useVendorProducts(params: { vendorOrgId: string; search: string; categoryId?: string }) {
  return useQuery({
    queryKey: [...keys.products(params.vendorOrgId), { search: params.search, categoryId: params.categoryId }],
    queryFn: () =>
      services.catalogue.listProducts({
        vendorOrgId: params.vendorOrgId,
        search: params.search || undefined,
        categoryId: params.categoryId,
        includeInactive: true,
      }),
    placeholderData: (prev) => prev,
  });
}

export function useCategories(vendorOrgId: string) {
  return useQuery({ queryKey: keys.categories(vendorOrgId), queryFn: () => services.catalogue.listCategories(vendorOrgId) });
}

export function useTags(vendorOrgId: string) {
  return useQuery({ queryKey: keys.tags(vendorOrgId), queryFn: () => services.catalogue.listTags(vendorOrgId) });
}

/** Usage + tier via loadVendorPlan — the single usage read (02 v1.1) behind Add Product, Invite and the plan screen. */
export function useVendorPlan(vendorOrgId: string) {
  return useQuery({ queryKey: keys.subscription(vendorOrgId), queryFn: () => loadVendorPlan(services, vendorOrgId) });
}

/** Under the subscription prefix, so a new request refreshes usage and history together. */
export function useUpgradeRequests(vendorOrgId: string) {
  return useQuery({
    queryKey: [...keys.subscription(vendorOrgId), 'requests'],
    queryFn: () => services.subscription.listUpgradeRequests(vendorOrgId),
  });
}

export function useProduct(productId: string | undefined) {
  return useQuery({
    queryKey: keys.product(productId ?? ''),
    queryFn: () => services.catalogue.getProduct(productId!),
    enabled: !!productId,
  });
}

export function usePriceTiers(productId: string | undefined) {
  return useQuery({
    queryKey: keys.priceTiers(productId ?? ''),
    queryFn: () => services.catalogue.listPriceTiers(productId!),
    enabled: !!productId,
  });
}

export function useBuyerOverrides(vendorOrgId: string, productId: string) {
  return useQuery({
    queryKey: keys.buyerOverrides(vendorOrgId, productId),
    queryFn: () => services.pricing.listBuyerOverrides({ vendorOrgId, productId }),
  });
}

export function useBuyerConnections(vendorOrgId: string) {
  return useQuery({ queryKey: keys.buyerConnections(vendorOrgId), queryFn: () => services.buyers.listConnections(vendorOrgId) });
}

function useInvalidateCatalogue(vendorOrgId: string) {
  const qc = useQueryClient();
  return (productId?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.products(vendorOrgId) }),
      qc.invalidateQueries({ queryKey: keys.subscription(vendorOrgId) }),
      productId ? qc.invalidateQueries({ queryKey: keys.product(productId) }) : undefined,
      productId ? qc.invalidateQueries({ queryKey: keys.priceTiers(productId) }) : undefined,
      qc.invalidateQueries({ queryKey: ['buyerCatalogue', vendorOrgId] }),
    ]);
}

export function useSaveProduct(vendorOrgId: string) {
  const invalidate = useInvalidateCatalogue(vendorOrgId);
  return useMutation({
    mutationFn: async (input: { productId?: string; values: ProductFormValues; tiers: PriceTierInput[] }) => {
      const product = input.productId
        ? await services.catalogue.updateProduct(input.productId, input.values)
        : await services.catalogue.createProduct({ ...input.values, vendorOrgId });
      await services.catalogue.setPriceTiers(product.id, input.tiers);
      return product;
    },
    onSuccess: (product) => invalidate(product.id),
  });
}

export function useDeleteProduct(vendorOrgId: string) {
  const invalidate = useInvalidateCatalogue(vendorOrgId);
  return useMutation({ mutationFn: (productId: string) => services.catalogue.deleteProduct(productId), onSuccess: () => invalidate() });
}

export function useSetBuyerOverride(vendorOrgId: string, productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { buyerOrgId: string; price: number }) => services.pricing.setBuyerOverride({ vendorOrgId, productId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.buyerOverrides(vendorOrgId, productId) }),
  });
}

export function useDeleteBuyerOverride(vendorOrgId: string, productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (override: BuyerProductPrice) => services.pricing.deleteBuyerOverride(override.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.buyerOverrides(vendorOrgId, productId) }),
  });
}

/** v1.1: vendors request a plan; only the Platform Admin (web) applies it. */
export function useRequestUpgrade(vendorOrgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tierId, message }: { tierId: string; message: string }) =>
      services.subscription.requestUpgrade({ vendorOrgId, requestedTierId: tierId, message }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.subscription(vendorOrgId) }),
  });
}
