"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addFavorite,
  checkoutQueries,
  discardDraft,
  draftKeys,
  draftQueries,
  isApiError,
  isValidQuantity,
  offerKeys,
  offerQueries,
  removeFavorite,
  type CartLine,
  type Favorite,
  type Offer,
  type OfferFilters,
} from "@repo/core";

/** Buyer-side catalogue/workspace hooks over the shared @repo/core factories. */

export function useConnectedVendors() {
  return useQuery(offerQueries.connectedVendors());
}

export function useOfferList(vendorId: string, filters: OfferFilters) {
  return useInfiniteQuery({ ...offerQueries.list(vendorId, filters), placeholderData: keepPreviousData });
}

/** One offer priced at a valid quantity (keeps the previous price on screen while re-pricing). */
export function useOffer(vendorId: string | null, productId: string, quantity?: number) {
  return useQuery({
    ...offerQueries.detail(vendorId ?? "", productId, quantity),
    enabled: !!vendorId,
    placeholderData: keepPreviousData,
  });
}

export function useOfferTaxonomy(vendorId: string) {
  return useQuery(offerQueries.taxonomy(vendorId));
}

export function useFeaturedOffers(vendorId: string) {
  return useQuery(offerQueries.featured(vendorId));
}

export function useMostOrdered(vendorId: string) {
  return useQuery(offerQueries.mostOrdered(vendorId));
}

export function useFavorites() {
  return useQuery(offerQueries.favorites());
}

/** Optimistic shared-favorite toggle; PUT needs current offer access, DELETE always succeeds. */
export function useToggleFavorite() {
  const qc = useQueryClient();
  const key = offerKeys.favorites();
  return useMutation({
    mutationFn: ({ productId, on }: { productId: string; on: boolean; offer?: Offer }) =>
      on ? addFavorite(productId).then(() => undefined) : removeFavorite(productId),
    onMutate: async ({ productId, on, offer }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Favorite[]>(key);
      qc.setQueryData<Favorite[]>(key, (favs = []) =>
        on
          ? favs.some((f) => f.productId === productId)
            ? favs
            : [{ productId, available: true, offer: offer ?? null, createdAt: new Date().toISOString() }, ...favs]
          : favs.filter((f) => f.productId !== productId),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export interface CartLineOffer {
  line: CartLine;
  /** Current offer priced at the line quantity (or at the product minimum while the quantity is invalid). */
  offer: Offer | undefined;
  /** The product is no longer orderable from this vendor (404 or disconnected). */
  unavailable: boolean;
  error: unknown;
  isPending: boolean;
}

/**
 * Current offers for every cart line. A line whose quantity does not fit its (last known)
 * minimum/step is priced at the product default so the cart can still show it and suggest a fix.
 */
export function useCartLineOffers(vendorId: string | undefined, lines: CartLine[]): CartLineOffer[] {
  const results = useQueries({
    queries: lines.map((line) => {
      const valid = line.snapshot ? isValidQuantity(line.quantity, line.snapshot) : false;
      return {
        ...offerQueries.detail(vendorId ?? "", line.productId, valid ? line.quantity : undefined),
        enabled: !!vendorId,
        placeholderData: keepPreviousData,
        retry: (count: number, error: unknown) => !isApiError(error) && count < 2,
      };
    }),
  });
  return lines.map((line, i) => {
    const r = results[i]!;
    const unavailable = isApiError(r.error) && (r.error.status === 404 || r.error.code === "RELATIONSHIP_UNAVAILABLE" || r.error.code === "TRADING_DISCONNECTED");
    return { line, offer: r.data, unavailable, error: unavailable ? null : r.error, isPending: r.isPending };
  });
}

export function useActiveLocations() {
  return useQuery(checkoutQueries.activeLocations());
}

export function useDrafts() {
  return useInfiniteQuery(draftQueries.list());
}

export function useDiscardDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, revision }: { draftId: string; revision: string }) => discardDraft(draftId, revision),
    onSettled: () => qc.invalidateQueries({ queryKey: draftKeys.all }),
  });
}
