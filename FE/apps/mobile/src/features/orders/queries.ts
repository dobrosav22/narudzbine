
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyReorder,
  parkCart,
  placeOrder,
  resumeDraft,
  services,
  type CartScope,
  type DraftCart,
  type ListOrdersParams,
  type Order,
} from '@repo/core';
import { cartStore } from '@/lib/cart';

export const orderKeys = {
  orders: (vendorOrgId: string, buyerOrgId: string) => ['orders', vendorOrgId, buyerOrgId] as const,
  order: (orderId: string) => ['order', orderId] as const,
  messages: (orderId: string) => ['orderMessages', orderId] as const,
  drafts: (vendorOrgId: string, buyerOrgId: string) => ['draftCarts', vendorOrgId, buyerOrgId] as const,
};

export function useBuyerLocations(buyerOrgId: string) {
  return useQuery({ queryKey: ['buyerLocations', buyerOrgId], queryFn: () => services.locations.listBuyerLocations(buyerOrgId) });
}

export function useBuyerUsers(buyerOrgId: string) {
  return useQuery({ queryKey: ['buyerUsers', buyerOrgId], queryFn: () => services.team.listBuyerUsers(buyerOrgId) });
}

export function useStatusConfig(vendorOrgId: string) {
  return useQuery({ queryKey: ['statusConfig', vendorOrgId], queryFn: () => services.orderStatusConfig.get(vendorOrgId) });
}

/** Includes inactive products: past orders must still show their names. */
export function useVendorProductNames(vendorOrgId: string) {
  return useQuery({
    queryKey: ['productNames', vendorOrgId],
    queryFn: async () => {
      const products = await services.catalogue.listProducts({ vendorOrgId, includeInactive: true });
      return new Map(products.map((p) => [p.id, p]));
    },
  });
}

export function useDraftCarts(scope: CartScope | undefined, currentUserId: string) {
  return useQuery({
    queryKey: orderKeys.drafts(scope?.vendorOrgId ?? '', scope?.buyerOrgId ?? ''),
    queryFn: () => services.draftCarts.list({ ...scope!, currentUserId }),
    enabled: !!scope,
  });
}

export function useBuyerOrders(scope: CartScope | undefined, filters: Pick<ListOrdersParams, 'locationId' | 'statusKey'>) {
  return useQuery({
    queryKey: [...orderKeys.orders(scope?.vendorOrgId ?? '', scope?.buyerOrgId ?? ''), filters],
    queryFn: () => services.orders.listOrders({ ...scope!, ...filters }),
    enabled: !!scope,
    placeholderData: (prev) => prev,
  });
}

export function useOrder(orderId: string) {
  return useQuery({ queryKey: orderKeys.order(orderId), queryFn: () => services.orders.getOrder(orderId) });
}


export function useParkCart(scope: CartScope | undefined, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => parkCart(services, cartStore, scope!, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.drafts(scope!.vendorOrgId, scope!.buyerOrgId) }),
  });
}

export function useDiscardDraft(scope: CartScope | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: DraftCart) => services.draftCarts.discard(draft.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.drafts(scope!.vendorOrgId, scope!.buyerOrgId) }),
  });
}

export function useResumeDraft(scope: CartScope | undefined) {
  return (draft: DraftCart) => scope && resumeDraft(cartStore, scope, draft);
}

export function usePlaceOrder(scope: CartScope | undefined, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locationId: string) => placeOrder(services, cartStore, scope!, { createdByUserId: userId, locationId }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: orderKeys.orders(scope!.vendorOrgId, scope!.buyerOrgId) }),
        qc.invalidateQueries({ queryKey: orderKeys.drafts(scope!.vendorOrgId, scope!.buyerOrgId) }),
        // Most-ordered shelf and stock numbers change with a new order.
        qc.invalidateQueries({ queryKey: ['buyerCatalogue', scope!.vendorOrgId] }),
      ]),
  });
}

/** Reorder into the cart of the ORDER's vendor (not necessarily the active one). */
export function useReorder() {
  return useMutation({
    mutationFn: (order: Order) => services.orders.reorder(order.id),
    onSuccess: (result, order) => applyReorder(cartStore, { buyerOrgId: order.buyerOrgId, vendorOrgId: order.vendorOrgId }, result),
  });
}

