/**
 * Cart → draft → order flows shared by apps/web and apps/mobile (03 → buyer
 * "Cart", "Draft carts", "Checkout", "Order detail → reorder"). They take the
 * services and the cart store as arguments so both apps behave identically.
 */
import type { AppServices } from '../services';
import type { DraftCart, Location, Order, ReorderResult } from '../types';
import type { CartRow } from '../catalogue/buyerCatalogue';
import type { CartScope, CartStore } from './store';
import { countMsg, formatNumber } from '../helpers';
import { msg, type Msg } from '../i18n/message';

/** The user's home location if it still exists, else the org's first location (01 §1: a default, not a restriction). */
export function defaultLocationId(locations: Location[], homeLocationId?: string): string | undefined {
  return locations.find((l) => l.id === homeLocationId)?.id ?? locations[0]?.id;
}

/** Why the cart can't be ordered yet — empty list means ready. Same messages on both platforms. */
export function checkoutProblems(params: { rows: CartRow[]; locationId?: string; locations: Location[] }): Msg[] {
  const problems: Msg[] = [];
  const orderable = params.rows.filter((r) => r.product);
  if (orderable.length === 0) problems.push(msg('validation.checkout.empty'));
  const unavailable = params.rows.length - orderable.length;
  if (unavailable > 0) problems.push(countMsg('validation.checkout.unavailable', unavailable));
  for (const r of params.rows) {
    if (r.product && r.belowMinimum) problems.push(msg('validation.checkout.belowMinimum', { product: r.product.name, min: formatNumber(r.product.minOrderQuantity ?? 1) }));
  }
  if (!params.locationId || !params.locations.some((l) => l.id === params.locationId)) problems.push(msg('validation.checkout.noLocation'));
  return problems;
}

/**
 * "Save for later" (01 §6 draft carts): saves the live cart as a draft visible
 * to the whole buyer org, then empties the cart. If the cart was resumed from a
 * draft, that draft is updated instead of creating another.
 */
export async function parkCart(
  deps: Pick<AppServices, 'draftCarts'>,
  store: CartStore,
  scope: CartScope,
  createdByUserId: string,
): Promise<DraftCart> {
  const state = store.getState(scope);
  const draft = await deps.draftCarts.save({
    id: state.draftCartId,
    buyerOrgId: scope.buyerOrgId,
    vendorOrgId: scope.vendorOrgId,
    locationId: state.locationId,
    createdByUserId,
    items: state.lines,
  });
  store.clear(scope);
  return draft;
}

/** Load a draft into the live cart (replacing it) and remember the link. */
export function resumeDraft(store: CartStore, scope: CartScope, draft: DraftCart): void {
  store.replace(scope, { lines: draft.items, locationId: draft.locationId, draftCartId: draft.id });
}

/** Place the order: prices are resolved and snapshotted by the service; the cart (and its draft) are cleared on success. */
export async function placeOrder(
  deps: Pick<AppServices, 'orders'>,
  store: CartStore,
  scope: CartScope,
  params: { createdByUserId: string; locationId: string },
): Promise<Order> {
  const state = store.getState(scope);
  const order = await deps.orders.createOrder({
    vendorOrgId: scope.vendorOrgId,
    buyerOrgId: scope.buyerOrgId,
    locationId: params.locationId,
    createdByUserId: params.createdByUserId,
    items: state.lines,
    fromDraftCartId: state.draftCartId,
  });
  store.clear(scope);
  return order;
}

/**
 * 01 §6 "Repeat order": past lines go into a fresh cart for the same delivery
 * location. Prices are NOT carried over — the cart re-resolves them, so the
 * buyer reviews current prices before checking out.
 */
export function applyReorder(store: CartStore, scope: CartScope, result: ReorderResult): void {
  store.replace(scope, { lines: result.items, locationId: result.locationId });
}
