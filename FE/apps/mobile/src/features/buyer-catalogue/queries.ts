import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  loadBuyerCatalogue,
  loadBuyerShelves,
  loadCartPricing,
  loadProductDetail,
  services,
  type BuyerFavorite,
  type CartLine,
} from '@repo/core';

/** Same key shapes as apps/web's buyer-catalogue/queries.ts. */
export const keys = {
  root: (vendorOrgId: string) => ['buyerCatalogue', vendorOrgId] as const,
  favorites: (buyerUserId: string) => ['favorites', buyerUserId] as const,
};

interface Scope {
  vendorOrgId: string;
  buyerOrgId: string;
}

export function useBuyerCatalogue(scope: Scope, filters: { search: string; categoryId?: string }) {
  return useQuery({
    queryKey: [...keys.root(scope.vendorOrgId), scope.buyerOrgId, 'list', filters],
    queryFn: () => loadBuyerCatalogue(services, { ...scope, ...filters }),
    placeholderData: (prev) => prev,
  });
}

export function useBuyerShelves(scope: Scope) {
  return useQuery({
    queryKey: [...keys.root(scope.vendorOrgId), scope.buyerOrgId, 'shelves'],
    queryFn: () => loadBuyerShelves(services, scope),
  });
}

export function useProductDetail(scope: Scope, productId: string) {
  return useQuery({
    queryKey: [...keys.root(scope.vendorOrgId), scope.buyerOrgId, 'detail', productId],
    queryFn: () => loadProductDetail(services, { ...scope, productId }),
  });
}

export function useLinePrice(scope: Scope, productId: string, quantity: number) {
  return useQuery({
    queryKey: [...keys.root(scope.vendorOrgId), scope.buyerOrgId, 'linePrice', productId, quantity],
    queryFn: async () => {
      const [price] = await services.pricing.resolvePrices({ ...scope, items: [{ productId, quantity }] });
      return price!;
    },
    enabled: quantity > 0,
    placeholderData: (prev) => prev,
  });
}

export function useCartPricing(scope: Scope | undefined, lines: CartLine[]) {
  return useQuery({
    queryKey: [...keys.root(scope?.vendorOrgId ?? ''), scope?.buyerOrgId, 'cart', lines],
    queryFn: () => loadCartPricing(services, { ...scope!, lines }),
    enabled: !!scope,
    // While re-pricing, keep showing the previous result only if it already covers every current
    // product (quantity change, removal) — never show another cart's rows (e.g. right after
    // resuming a draft) as if they were this one; new products show the loading state instead.
    placeholderData: (prev) => {
      if (!prev) return undefined;
      const priced = new Set(prev.rows.map((r) => r.line.productId));
      if (!lines.every((l) => priced.has(l.productId))) return undefined;
      const current = new Set(lines.map((l) => l.productId));
      return { ...prev, rows: prev.rows.filter((r) => current.has(r.line.productId)) };
    },
  });
}

export function useCategories(vendorOrgId: string) {
  return useQuery({ queryKey: ['categories', vendorOrgId], queryFn: () => services.catalogue.listCategories(vendorOrgId) });
}

export function useFavorites(buyerUserId: string) {
  return useQuery({ queryKey: keys.favorites(buyerUserId), queryFn: () => services.favorites.list(buyerUserId) });
}

export function useToggleFavorite(buyerUserId: string) {
  const qc = useQueryClient();
  const key = keys.favorites(buyerUserId);
  return useMutation({
    mutationFn: (productId: string) => services.favorites.toggle(buyerUserId, productId),
    onMutate: async (productId) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BuyerFavorite[]>(key);
      qc.setQueryData<BuyerFavorite[]>(key, (favs = []) =>
        favs.some((f) => f.productId === productId)
          ? favs.filter((f) => f.productId !== productId)
          : [...favs, { id: `optimistic-${productId}`, buyerUserId, productId }],
      );
      return { previous };
    },
    onError: (_e, _productId, ctx) => qc.setQueryData(key, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
