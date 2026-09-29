"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadBuyerDetail,
  loadBuyerRows,
  loadVendorOrderContext,
  services,
  type ListOrdersParams,
  type OrderStatus,
} from "@repo/core";

/**
 * Keys share prefixes with the buyer screens (["orders", vendorOrgId, …],
 * ["order", id], ["statusConfig", vendorOrgId]) so one invalidation refreshes both sides.
 */
export const vendorKeys = {
  context: (vendorOrgId: string) => ["vendorOrderContext", vendorOrgId] as const,
  orders: (vendorOrgId: string) => ["orders", vendorOrgId] as const,
  order: (orderId: string) => ["order", orderId] as const,
  statusConfig: (vendorOrgId: string) => ["statusConfig", vendorOrgId] as const,
  buyerRows: (vendorOrgId: string) => ["buyerRows", vendorOrgId] as const,
  buyerDetail: (vendorOrgId: string, buyerOrgId: string) => ["buyerDetail", vendorOrgId, buyerOrgId] as const,
};

export function useVendorOrderContext(vendorOrgId: string) {
  return useQuery({ queryKey: vendorKeys.context(vendorOrgId), queryFn: () => loadVendorOrderContext(services, vendorOrgId) });
}

export function useVendorOrders(vendorOrgId: string, filters: Omit<ListOrdersParams, "vendorOrgId">) {
  return useQuery({
    queryKey: [...vendorKeys.orders(vendorOrgId), "vendor", filters],
    queryFn: () => services.orders.listOrders({ vendorOrgId, ...filters }),
    placeholderData: keepPreviousData,
  });
}

export function useVendorOrder(orderId: string) {
  return useQuery({ queryKey: vendorKeys.order(orderId), queryFn: () => services.orders.getOrder(orderId) });
}

export function useUpdateOrderStatus(vendorOrgId: string, orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (statusKey: string) => services.orders.updateOrderStatus(orderId, statusKey),
    onSuccess: (order) => {
      qc.setQueryData(vendorKeys.order(orderId), order);
      return qc.invalidateQueries({ queryKey: vendorKeys.orders(vendorOrgId) });
    },
  });
}

export function useStatusConfig(vendorOrgId: string) {
  return useQuery({ queryKey: vendorKeys.statusConfig(vendorOrgId), queryFn: () => services.orderStatusConfig.get(vendorOrgId) });
}

export function useSaveStatusConfig(vendorOrgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (statuses: OrderStatus[]) => services.orderStatusConfig.update(vendorOrgId, statuses),
    onSuccess: (config) => {
      qc.setQueryData(vendorKeys.statusConfig(vendorOrgId), config);
      return qc.invalidateQueries({ queryKey: vendorKeys.context(vendorOrgId) });
    },
  });
}

export function useBuyerRows(vendorOrgId: string) {
  return useQuery({ queryKey: vendorKeys.buyerRows(vendorOrgId), queryFn: () => loadBuyerRows(services, vendorOrgId) });
}

export function useBuyerDetail(vendorOrgId: string, buyerOrgId: string) {
  return useQuery({
    queryKey: vendorKeys.buyerDetail(vendorOrgId, buyerOrgId),
    queryFn: () => loadBuyerDetail(services, vendorOrgId, buyerOrgId),
  });
}

export function useInviteBuyer(vendorOrgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => services.invites.createBuyerOrgInvite({ vendorOrgId, email }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: vendorKeys.buyerRows(vendorOrgId) }),
        // A pending invite holds a seat against the plan's buyer limit.
        qc.invalidateQueries({ queryKey: ["subscription", vendorOrgId] }),
      ]),
  });
}

export function useRemoveConnection(vendorOrgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (buyerOrgId: string) => services.buyers.removeConnection(vendorOrgId, buyerOrgId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: vendorKeys.buyerRows(vendorOrgId) }),
        qc.invalidateQueries({ queryKey: vendorKeys.context(vendorOrgId) }),
        qc.invalidateQueries({ queryKey: ["subscription", vendorOrgId] }),
        qc.invalidateQueries({ queryKey: ["buyerConnections", vendorOrgId] }),
      ]),
  });
}
