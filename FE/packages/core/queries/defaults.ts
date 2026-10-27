import { isApiError, retryDelayMs } from '../api/problem';

/**
 * Shared TanStack Query defaults for both apps. Retrying never fixes a 4xx (validation,
 * permission, not found, conflict); it can fix network blips and 503/429.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!isApiError(error)) return true;
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

/** Mutations are never retried automatically (no uncertain-outcome blind retry). */
export const QUERY_DEFAULTS = {
  queries: { staleTime: 30_000, retry: shouldRetryQuery, retryDelay: retryDelayMs, refetchOnWindowFocus: true },
  mutations: { retry: false },
} as const;
