/**
 * Buyer workspace: organization-shared drafts and read-only reorder preparation.
 *
 *   GET/POST /drafts, GET/PUT/DELETE /drafts/{id}, POST /drafts/{id}/submission
 *   GET /orders/{orderId}/reorder-preview
 *
 * Drafts are saved shared work (any owner/admin/staff of the buyer may edit, discard or — subject
 * to the staff submission restriction — submit). Writes carry the opaque expectedRevision; a stale
 * one returns 409 REVISION_CONFLICT and the UI keeps the user's local work. No inactivity expiry.
 *
 * ── Reorder API (for the buyer order detail screen) ──────────────────────────────────────────
 *   reorderPlan(preview: ReorderPreview): ReorderPlan
 *     Pure. Turns GET /orders/{orderId}/reorder-preview into cart lines. Lines whose currentOffer
 *     is null are not orderable and are returned in `unavailable`. Every other line is copied with
 *     its ORIGINAL quantity (never silently changed); lines whose original quantity no longer fits
 *     the current minimum/step, or that report price/text/stock changes, are listed in `attention`
 *     so the cart can flag them. `vendorId` is the vendor of the offers (null if none is available).
 *   applyReorder(store, scope, plan, mode = 'merge'): void
 *     Writes the plan into the (buyer, vendor) cart, merging with or replacing existing lines.
 *   Apps expose `useReorderIntoCart()` from `@/lib/cart` (web and mobile), which fetches the
 *   preview, selects the vendor as the active vendor and applies the plan.
 */
import { api, data } from '../api/client';
import type { Draft, DraftInput, DraftUpdate, Order, ReorderLine, ReorderPreview, ReviewedLine, SubmitDraft } from '../api/models.gen';
import { snapshotFromOffer, mergeCartLines, type CartLine, type CartScope, type CartStore } from '../cart/store';

export const draftKeys = {
  all: ['drafts'] as const,
  list: () => ['drafts', 'list'] as const,
  detail: (draftId: string) => ['drafts', 'detail', draftId] as const,
  reorder: (orderId: string) => ['drafts', 'reorder', orderId] as const,
};

const DRAFT_PAGE = 25;

export const draftQueries = {
  /** OPEN drafts, newest first, as offset pages for useInfiniteQuery. */
  list: () => ({
    queryKey: draftKeys.list(),
    queryFn: ({ pageParam }: { pageParam: number }) =>
      data(api.GET('/drafts', { params: { query: { size: DRAFT_PAGE, page: pageParam, ...(pageParam === 0 ? { includeTotal: true } : {}) } } })),
    initialPageParam: 0,
    getNextPageParam: (last: { items: Draft[]; page: number; size: number }) => (last.items.length < last.size ? undefined : last.page + 1),
  }),
  detail: (draftId: string) => ({
    queryKey: draftKeys.detail(draftId),
    queryFn: () => data(api.GET('/drafts/{draftId}', { params: { path: { draftId } } })),
  }),
  /** Read-only; creates nothing. Prices/availability are "now", not a quote. */
  reorderPreview: (orderId: string) => ({
    queryKey: draftKeys.reorder(orderId),
    queryFn: () => data(api.GET('/orders/{orderId}/reorder-preview', { params: { path: { orderId } } })),
    staleTime: 0,
  }),
};

/** Create with a client UUIDv7 kept for the whole save intent (a retry replays the original 201). */
export function createDraft(input: DraftInput): Promise<Draft> {
  return data(api.POST('/drafts', { body: input }));
}

export function updateDraft(draftId: string, body: DraftUpdate): Promise<Draft> {
  return data(api.PUT('/drafts/{draftId}', { params: { path: { draftId } }, body }));
}

export async function discardDraft(draftId: string, expectedRevision: string): Promise<void> {
  await data(api.DELETE('/drafts/{draftId}', { params: { path: { draftId }, query: { expectedRevision } } }));
}

/** Natural identity (reviewId + expectedRevision): an exact retry returns the original order. No Idempotency-Key. */
export function submitDraft(draftId: string, body: SubmitDraft): Promise<Order> {
  return data(api.POST('/drafts/{draftId}/submission', { params: { path: { draftId } }, body }));
}

// ── Reorder ────────────────────────────────────────────────────────────────

export interface ReorderAttention {
  line: ReviewedLine;
  changes: ReorderLine['changes'];
  /** The original quantity does not fit the current minimum/step: the buyer must choose one. */
  quantityInvalid: boolean;
}

export interface ReorderPlan {
  vendorId: string | null;
  lines: CartLine[];
  unavailable: ReviewedLine[];
  attention: ReorderAttention[];
}

export function reorderPlan(preview: ReorderPreview): ReorderPlan {
  const lines: CartLine[] = [];
  const unavailable: ReviewedLine[] = [];
  const attention: ReorderAttention[] = [];
  let vendorId: string | null = null;
  for (const entry of preview.lines) {
    const offer = entry.currentOffer;
    if (!offer) {
      unavailable.push(entry.original);
      continue;
    }
    vendorId ??= offer.vendorId;
    const existing = lines.find((l) => l.productId === entry.original.productId);
    if (existing) existing.quantity += entry.original.quantity;
    else lines.push({ productId: entry.original.productId, quantity: entry.original.quantity, snapshot: snapshotFromOffer(offer) });
    const changes = entry.changes.filter((c) => c !== 'UNAVAILABLE');
    if (!entry.available || changes.length > 0) {
      attention.push({ line: entry.original, changes: entry.changes, quantityInvalid: entry.changes.includes('MINIMUM') || entry.changes.includes('STEP') });
    }
  }
  return { vendorId, lines, unavailable, attention };
}

/** Writes a reorder plan into the cart. 'merge' (default) keeps existing prepared work. */
export function applyReorder(store: CartStore, scope: CartScope, plan: ReorderPlan, mode: 'merge' | 'replace' = 'merge'): void {
  const state = store.getState(scope);
  if (mode === 'replace') {
    // A replaced cart is new work: it must not overwrite the draft it was linked to.
    store.replace(scope, { ...state, lines: plan.lines, draft: null });
  } else {
    store.replace(scope, { ...state, lines: mergeCartLines(state.lines, plan.lines) });
  }
}
