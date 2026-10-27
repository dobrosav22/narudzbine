import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { reportKeys, reportQueries, type ReportRange, type ReportSummaryRange } from '@repo/core';

const PAGE = 25;

export function useReportSummary(range: ReportSummaryRange) {
  return useQuery({ ...reportQueries.summary(range), placeholderData: keepPreviousData });
}

/** Product report as an endless list (offset pages). */
export function useProductReportPages(range: ReportRange, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...reportKeys.products({ ...range, page: -1 }), 'infinite'] as const,
    queryFn: ({ pageParam }) => reportQueries.products({ ...range, page: pageParam, size: PAGE }).queryFn(),
    initialPageParam: 0,
    getNextPageParam: (last, _all, lastPage) => (last.items.length === PAGE ? lastPage + 1 : undefined),
    enabled,
  });
}

/** Vendor organizations only. */
export function useBuyerReportPages(range: ReportRange, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...reportKeys.buyers({ ...range, page: -1 }), 'infinite'] as const,
    queryFn: ({ pageParam }) => reportQueries.buyers({ ...range, page: pageParam, size: PAGE }).queryFn(),
    initialPageParam: 0,
    getNextPageParam: (last, _all, lastPage) => (last.items.length === PAGE ? lastPage + 1 : undefined),
    enabled,
  });
}
