import { api, data } from '../api/client';
import type { ReconciliationCandidate, Stock, StockAbsolute, StockDelta, Tracking } from '../api/models';

/*
 * Vendor inventory: tracking mode, per-product counts (set / delta / confirm), stock history and
 * the all-product reconciliation that enables tracking (prepare → acknowledge every line in
 * batches → confirm). An absent count (null) differs from a confirmed zero.
 */

export const inventoryKeys = {
  all: ['inventory'] as const,
  tracking: () => ['inventory', 'tracking'] as const,
  stock: (productId: string) => ['inventory', 'stock', productId] as const,
  events: (productId: string | undefined) => ['inventory', 'events', productId ?? 'all'] as const,
  reconciliation: (id: string) => ['inventory', 'reconciliation', id] as const,
  reconciliationLines: (id: string) => ['inventory', 'reconciliation', id, 'lines'] as const,
};

export const inventoryQueries = {
  tracking: () => ({ queryKey: inventoryKeys.tracking(), queryFn: () => data(api.GET('/inventory/tracking')) }),
  stock: (productId: string) => ({
    queryKey: inventoryKeys.stock(productId),
    queryFn: () => data(api.GET('/inventory/products/{productId}', { params: { path: { productId } } })),
  }),
  /** Cursor list (use with useInfiniteQuery: initialPageParam undefined, getNextPageParam = nextCursor). */
  events: (productId?: string) => ({
    queryKey: inventoryKeys.events(productId),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      data(api.GET('/inventory/events', { params: { query: { size: 25, ...(productId ? { productId } : {}), ...(pageParam ? { cursor: pageParam } : {}) } } })),
  }),
  reconciliation: (id: string) => ({
    queryKey: inventoryKeys.reconciliation(id),
    queryFn: () => data(api.GET('/inventory/reconciliations/{previewId}', { params: { path: { previewId: id } } })),
  }),
  reconciliationLines: (id: string, size = 25) => ({
    queryKey: [...inventoryKeys.reconciliationLines(id), size] as const,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      data(
        api.GET('/inventory/reconciliations/{previewId}/lines', {
          params: { path: { previewId: id }, query: { size, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
  }),
};

export function disableTracking(expectedRevision: string): Promise<Tracking> {
  return data(api.POST('/inventory/tracking/disable', { body: { expectedRevision } }));
}

export function prepareReconciliation() {
  return data(api.POST('/inventory/reconciliations', {}));
}

export function acknowledgeReconciliationLines(previewId: string, expectedRevision: string, lines: ReconciliationCandidate[]) {
  return data(api.PUT('/inventory/reconciliations/{previewId}/lines', { params: { path: { previewId } }, body: { expectedRevision, lines } }));
}

export function enableTracking(previewId: string, expectedRevision: string): Promise<Tracking> {
  return data(api.POST('/inventory/reconciliations/{previewId}/confirmation', { params: { path: { previewId } }, body: { expectedRevision, confirmAll: true } }));
}

export function setStock(productId: string, body: StockAbsolute): Promise<Stock> {
  return data(api.PUT('/inventory/products/{productId}', { params: { path: { productId } }, body }));
}

/**
 * Stock delta. `idempotencyKey` (UUIDv4) belongs to the pending intent: reuse it only to retry
 * the same body after an uncertain outcome; a new intent gets a new key.
 */
export function adjustStock(productId: string, body: StockDelta, idempotencyKey: string): Promise<Stock> {
  return data(
    api.POST('/inventory/products/{productId}/adjustments', {
      params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } },
      body,
    }),
  );
}

export function confirmStock(productId: string, expectedRevision: string): Promise<Stock> {
  return data(api.POST('/inventory/products/{productId}/confirmation', { params: { path: { productId } }, body: { expectedRevision } }));
}

/** Reconciliation batches hold 1..100 distinct products. */
export const RECONCILIATION_BATCH_MAX = 100;
/** Optional stock reason: 1..1000 code points, or null. */
export const STOCK_REASON_MAX = 1000;

/** How to show a stock record: absent (never counted), stale (needs confirmation) or current. */
export function stockStatus(stock: Stock | undefined): 'unknown' | 'absent' | 'stale' | 'current' {
  if (!stock) return 'unknown';
  if (stock.availableCount === null) return 'absent';
  return stock.confirmationRequired ? 'stale' : 'current';
}
