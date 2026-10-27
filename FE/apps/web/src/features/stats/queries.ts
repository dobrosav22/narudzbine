"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  reportExportPollDelay,
  reportQueries,
  type ReportSummaryRange,
  type ReportTableQuery,
} from "@repo/core";

export function useReportSummary(range: ReportSummaryRange, enabled = true) {
  return useQuery({ ...reportQueries.summary(range), placeholderData: keepPreviousData, enabled });
}

export function useProductReport(q: ReportTableQuery, enabled = true) {
  return useQuery({ ...reportQueries.products(q), placeholderData: keepPreviousData, enabled });
}

/** Vendor organizations only. */
export function useBuyerReport(q: ReportTableQuery, enabled = true) {
  return useQuery({ ...reportQueries.buyers(q), placeholderData: keepPreviousData, enabled });
}

/** Polls an accepted export with bounded backoff until it leaves QUEUED. */
export function useExportStatus(exportId: string) {
  return useQuery({
    ...reportQueries.export(exportId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data?.state === "QUEUED" ? reportExportPollDelay(query.state.dataUpdateCount - 1) : false),
  });
}
