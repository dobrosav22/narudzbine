"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { services, type StatsFilter } from "@repo/core";

/**
 * Stats are aggregations of orders, so their keys sit under the order keys
 * (["orders", vendorOrgId, …] and ["orders", vendorOrgId, buyerOrgId, …]): placing an
 * order or changing its status already invalidates those prefixes, which refreshes
 * every stat derived from them.
 */
export const statsKeys = {
  vendorSummary: (vendorOrgId: string) => ["orders", vendorOrgId, "stats", "summary"] as const,
  byProduct: (vendorOrgId: string, filter: StatsFilter) => ["orders", vendorOrgId, "stats", "byProduct", filter] as const,
  byBuyer: (vendorOrgId: string, filter: StatsFilter) => ["orders", vendorOrgId, "stats", "byBuyer", filter] as const,
  buyerSummary: (vendorOrgId: string, buyerOrgId: string, filter: StatsFilter) =>
    ["orders", vendorOrgId, buyerOrgId, "stats", filter] as const,
};

export function useVendorSummary(vendorOrgId: string) {
  return useQuery({ queryKey: statsKeys.vendorSummary(vendorOrgId), queryFn: () => services.stats.getVendorSummary(vendorOrgId) });
}

export function useProductStats(vendorOrgId: string, filter: StatsFilter, enabled = true) {
  return useQuery({
    queryKey: statsKeys.byProduct(vendorOrgId, filter),
    queryFn: () => services.stats.byProduct(vendorOrgId, filter),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useBuyerStats(vendorOrgId: string, filter: StatsFilter, enabled = true) {
  return useQuery({
    queryKey: statsKeys.byBuyer(vendorOrgId, filter),
    queryFn: () => services.stats.byBuyer(vendorOrgId, filter),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useBuyerSummary(scope: { vendorOrgId: string; buyerOrgId: string } | undefined, filter: StatsFilter) {
  return useQuery({
    queryKey: statsKeys.buyerSummary(scope?.vendorOrgId ?? "", scope?.buyerOrgId ?? "", filter),
    queryFn: () => services.stats.getBuyerSummary(scope!.buyerOrgId, scope!.vendorOrgId, filter),
    enabled: !!scope,
    placeholderData: keepPreviousData,
  });
}
