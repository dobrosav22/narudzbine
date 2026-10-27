"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { planKeys, planQueries, requestVendorPlanChange, withdrawVendorPlanRequest } from "@repo/core";

/** Current plan + usage (vendor organizations; every role). */
export function useVendorPlan(enabled = true) {
  return useQuery({ ...planQueries.current(), enabled });
}

export function useAvailablePlans(includeRetired = false) {
  return useQuery(planQueries.available(includeRetired));
}

/** Owner/admin only — staff get 403, so callers pass `enabled: isOrgAdmin(session)`. */
export function usePlanRequests(enabled: boolean) {
  return useQuery({ ...planQueries.requests(), enabled });
}

export function useRequestPlanChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: requestVendorPlanChange,
    onSettled: () => qc.invalidateQueries({ queryKey: planKeys.all }),
  });
}

export function useWithdrawPlanRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: withdrawVendorPlanRequest,
    onSettled: () => qc.invalidateQueries({ queryKey: planKeys.all }),
  });
}
