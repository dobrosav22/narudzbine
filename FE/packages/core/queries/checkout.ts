/**
 * Checkout: the exact review receipt, then explicit submission.
 *
 *   POST /order-reviews                   → immutable 15-minute receipt (exact lines, prices, total,
 *                                            delivery snapshot). Holds no stock/prices; no order yet.
 *   POST /orders {reviewId}               → direct order; REQUIRES a UUIDv4 Idempotency-Key kept per
 *                                            receipt (a receipt can otherwise be submitted again —
 *                                            observed locally: same reviewId + new key = second order).
 *   POST /drafts/{id}/submission          → draft-bound receipt + expectedRevision; consumes the draft.
 *
 * The orchestration below is framework-free and shared by web and mobile. It persists an
 * in-flight submission in the cart (pendingSubmission) BEFORE sending, so a lost response can be
 * reconciled by retrying the exact same request (same receipt and key / same draft revision)
 * instead of creating a duplicate order. Nothing is ever retried automatically.
 */
import { api, data } from '../api/client';
import { uuidv4 } from '../api/ids';
import { isApiError, isUncertainOutcome } from '../api/problem';
import type { Draft, Location, Order, OrderReview, ReviewRequest, UnavailableReviewLine } from '../api/models.gen';
import type { BusinessState } from '../session/store';
import {
  draftIntentFromCart,
  orderIntentFromCart,
  type CartDraftLink,
  type CartScope,
  type CartStore,
  type PendingSubmission,
} from '../cart/store';
import { createDraft, submitDraft, updateDraft } from './buyerWorkspace';

export const checkoutKeys = {
  /** Shares the `['organization', 'locations']` prefix so location edits elsewhere can invalidate it. */
  activeLocations: () => ['organization', 'locations', 'active-all'] as const,
};

async function fetchActiveLocations(): Promise<Location[]> {
  const items: Location[] = [];
  for (let page = 0; page < 20; page++) {
    const result = await data(api.GET('/organization/locations', { params: { query: { state: 'ACTIVE', size: 100, page } } }));
    items.push(...result.items);
    if (result.items.length < result.size) break;
  }
  return items;
}

export const checkoutQueries = {
  /** The buyer's own ACTIVE delivery locations (management screens live elsewhere). */
  activeLocations: () => ({ queryKey: checkoutKeys.activeLocations(), queryFn: fetchActiveLocations }),
};

export function reviewOrder(body: ReviewRequest): Promise<OrderReview> {
  return data(api.POST('/order-reviews', { body }));
}

export function submitOrder(reviewId: string, idempotencyKey: string): Promise<Order> {
  return data(api.POST('/orders', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body: { reviewId } }));
}

/** Buyer staff may prepare and review but not submit while the organization restricts staff submission. */
export function canSubmitOrders(state: Pick<BusinessState, 'account' | 'organization'>): boolean {
  return state.organization.type === 'BUYER' && (state.account.role !== 'STAFF' || !state.organization.staffSubmissionRestricted);
}

export interface TermsChange {
  /** A fresh receipt when the whole intent is still orderable (reconfirm it explicitly), else null. */
  currentTerms: OrderReview | null;
  unavailableLines: UnavailableReviewLine[];
}

/** The TERMS_CHANGED extension of a 409, or null for any other error. */
export function termsChange(error: unknown): TermsChange | null {
  if (!isApiError(error, 'TERMS_CHANGED')) return null;
  return { currentTerms: error.problem.currentTerms ?? null, unavailableLines: error.problem.unavailableLines ?? [] };
}

/** Product ids whose final unit price or quantity differ between two receipts (for highlighting). */
export function changedReviewLines(previous: OrderReview, next: OrderReview): Set<string> {
  const before = new Map(previous.lines.map((l) => [l.productId, l]));
  const changed = new Set<string>();
  for (const line of next.lines) {
    const old = before.get(line.productId);
    if (!old || old.quantity !== line.quantity || old.price.finalUnitPrice !== line.price.finalUnitPrice || old.price.lineTotal !== line.price.lineTotal) {
      changed.add(line.productId);
    }
  }
  return changed;
}

export class IncompleteIntentError extends Error {
  constructor() {
    super('The cart needs at least one line and a delivery location before review.');
    this.name = 'IncompleteIntentError';
  }
}

/** A receipt plus the draft it is bound to (null for a direct order). */
export interface ReviewedCheckout {
  review: OrderReview;
  draft: CartDraftLink | null;
}

/**
 * Saves the cart as a shared draft: updates the linked draft (expectedRevision) unless `asNew`,
 * otherwise creates one with `newDraftId` (a UUIDv7 the caller keeps for this save intent so a
 * retry after a lost response replays instead of duplicating). Links the cart to the result.
 */
export async function saveCartAsDraft(store: CartStore, scope: CartScope, options: { newDraftId: string; asNew?: boolean }): Promise<Draft> {
  const state = store.getState(scope);
  const intent = draftIntentFromCart(state, scope.vendorId);
  const draft =
    state.draft && !options.asNew
      ? await updateDraft(state.draft.id, { expectedRevision: state.draft.revision, intent })
      : await createDraft({ id: options.newDraftId, intent });
  store.linkDraft(scope, { id: draft.id, revision: draft.revision });
  return draft;
}

/**
 * Requests the exact receipt for the cart. A cart linked to a draft first saves its current intent
 * into that draft (a no-op when unchanged) so the receipt is draft-bound and submission consumes
 * the draft; a stale draft rejects with 409 REVISION_CONFLICT and the cart is left untouched.
 */
export async function prepareReview(store: CartStore, scope: CartScope): Promise<ReviewedCheckout> {
  const state = store.getState(scope);
  const intent = orderIntentFromCart(state, scope.vendorId);
  if (!intent) throw new IncompleteIntentError();
  if (!state.draft) {
    return { review: await reviewOrder({ intent, draftId: null, draftRevision: null }), draft: null };
  }
  const saved = await updateDraft(state.draft.id, { expectedRevision: state.draft.revision, intent });
  const link = { id: saved.id, revision: saved.revision };
  store.linkDraft(scope, link);
  return { review: await reviewOrder({ intent, draftId: link.id, draftRevision: link.revision }), draft: link };
}

function send(pending: PendingSubmission): Promise<Order> {
  return pending.kind === 'ORDER'
    ? submitOrder(pending.reviewId, pending.idempotencyKey)
    : submitDraft(pending.draftId, { reviewId: pending.reviewId, expectedRevision: pending.expectedRevision });
}

/** Outcomes that leave the submission's result unknown: keep the pending intent for an exact retry. */
function outcomeUnknown(error: unknown): boolean {
  return isUncertainOutcome(error) || isApiError(error, 'REQUEST_IN_PROGRESS');
}

async function run(store: CartStore, scope: CartScope, pending: PendingSubmission): Promise<Order> {
  store.setPendingSubmission(scope, pending);
  try {
    const order = await send(pending);
    store.clear(scope);
    return order;
  } catch (error) {
    if (!outcomeUnknown(error)) store.setPendingSubmission(scope, null);
    throw error;
  }
}

/**
 * Explicitly submits a reviewed checkout. Direct orders reuse the Idempotency-Key already kept for
 * this receipt (only a retry of the same receipt reuses it); draft submissions use the receipt and
 * the reviewed draft revision. On success the cart is emptied. TERMS_CHANGED, expiry and other
 * definite rejections clear the pending intent and rethrow for the screen to explain.
 */
export function submitReviewed(store: CartStore, scope: CartScope, reviewed: ReviewedCheckout, now: Date = new Date()): Promise<Order> {
  const existing = store.getState(scope).pendingSubmission;
  const startedAt = now.toISOString();
  const pending: PendingSubmission =
    existing && existing.reviewId === reviewed.review.id
      ? existing
      : reviewed.draft
        ? { kind: 'DRAFT', reviewId: reviewed.review.id, draftId: reviewed.draft.id, expectedRevision: reviewed.draft.revision, startedAt }
        : { kind: 'ORDER', reviewId: reviewed.review.id, idempotencyKey: uuidv4(), startedAt };
  return run(store, scope, pending);
}

/** Retries the exact pending submission (after a lost response) to learn its outcome. */
export function retryPendingSubmission(store: CartStore, scope: CartScope): Promise<Order> {
  const pending = store.getState(scope).pendingSubmission;
  if (!pending) return Promise.reject(new Error('No pending submission to retry.'));
  return run(store, scope, pending);
}
