"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  applyReorder,
  cartItemCount,
  createCartStore,
  EMPTY_CART,
  reorderPlan,
  snapshotFromOffer,
  type CartDetails,
  type CartDraftLink,
  type CartScope,
  type CartState,
  type Offer,
  type ReorderPlan,
  type ReorderPreview,
} from "@repo/core";
import { sessionStore, useSession, webStorage } from "./session";

/**
 * The buyer's local cart (no backend live cart): one per (buyer organization, vendor), kept in
 * this browser's localStorage. Logic lives in @repo/core (shared with mobile).
 */
export const cartStore = createCartStore(webStorage);

/** The cart of the signed-in buyer's active vendor; empty (and inert) for everyone else. */
export function useCart() {
  const session = useSession();
  const buyerOrgId = session.status === "business" && session.organization.type === "BUYER" ? session.organization.id : null;
  const vendorId = session.status === "business" ? session.activeVendorId : null;
  const scope: CartScope | undefined = useMemo(
    () => (buyerOrgId && vendorId ? { buyerOrgId, vendorId } : undefined),
    [buyerOrgId, vendorId],
  );
  return useCartFor(scope);
}

/** The cart of an explicit (buyer, vendor) scope, e.g. a draft's vendor. */
export function useCartFor(scope: CartScope | undefined) {
  useEffect(() => {
    if (scope) void cartStore.hydrate(scope);
  }, [scope]);

  const state: CartState = useSyncExternalStore(
    cartStore.subscribe,
    () => (scope ? cartStore.getState(scope) : EMPTY_CART),
    () => EMPTY_CART,
  );

  return useMemo(
    () => ({
      scope,
      state,
      lines: state.lines,
      /** Distinct products in the cart (for the nav badge). */
      itemCount: cartItemCount(state.lines),
      quantityOf: (productId: string) => state.lines.find((l) => l.productId === productId)?.quantity ?? 0,
      add: (offer: Offer, quantity: number) => scope && cartStore.add(scope, offer.product.id, quantity, snapshotFromOffer(offer)),
      setQuantity: (productId: string, quantity: number) => scope && cartStore.setQuantity(scope, productId, quantity),
      remove: (productId: string) => scope && cartStore.remove(scope, productId),
      updateDetails: (patch: Partial<CartDetails>) => scope && cartStore.updateDetails(scope, patch),
      linkDraft: (link: CartDraftLink | null) => scope && cartStore.linkDraft(scope, link),
      replace: (next: CartState) => scope && cartStore.replace(scope, next),
      clear: () => scope && cartStore.clear(scope),
    }),
    [scope, state],
  );
}

export interface ReorderOutcome {
  /** Null when no line of the order is currently orderable (the cart was not touched). */
  vendorId: string | null;
  plan: ReorderPlan;
}

/**
 * Reorder for the buyer order detail screen (agent D1):
 *
 *   const reorderIntoCart = useReorderIntoCart();
 *   const outcome = await reorderIntoCart(preview, { mode: "merge" });   // preview: GET /orders/{id}/reorder-preview
 *   // outcome.plan.unavailable → lines that could not be added; outcome.plan.attention → lines to check
 *   if (outcome.vendorId) router.push("/buyer/cart");
 *
 * Read-only preparation: nothing is created on the backend. Original quantities are copied
 * unchanged (the cart flags ones that no longer fit the minimum/step); the order's vendor becomes
 * the active vendor. 'merge' (default) adds to existing cart lines; 'replace' starts new work.
 */
export function useReorderIntoCart() {
  const session = useSession();
  const buyerOrgId = session.status === "business" && session.organization.type === "BUYER" ? session.organization.id : null;
  return useCallback(
    async (preview: ReorderPreview, options: { mode?: "merge" | "replace" } = {}): Promise<ReorderOutcome> => {
      const plan = reorderPlan(preview);
      if (!buyerOrgId || !plan.vendorId || plan.lines.length === 0) return { vendorId: null, plan };
      const scope = { buyerOrgId, vendorId: plan.vendorId };
      await cartStore.hydrate(scope);
      applyReorder(cartStore, scope, plan, options.mode ?? "merge");
      await sessionStore.selectVendor(plan.vendorId);
      return { vendorId: plan.vendorId, plan };
    },
    [buyerOrgId],
  );
}
