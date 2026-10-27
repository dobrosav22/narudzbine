"use client";

import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cartFromDraft,
  draftKeys,
  draftQueries,
  isApiError,
  saveCartAsDraft,
  uuidv7,
  type CartLineSnapshot,
  type CartScope,
  type Draft,
} from "@repo/core";
import { cartStore } from "@/lib/cart";

/**
 * Save the cart as shared saved work: updates the linked draft (expectedRevision) or creates a new
 * one. The new draft's UUIDv7 is kept for the whole save intent so a retry after a lost response
 * replays the original creation instead of creating a second draft; it is renewed after success.
 */
export function useSaveCartAsDraft(scope: CartScope | undefined) {
  const qc = useQueryClient();
  const newId = useRef<string | null>(null);
  return useMutation({
    mutationFn: ({ asNew = false }: { asNew?: boolean } = {}) => {
      if (!scope) return Promise.reject(new Error("No active vendor cart."));
      newId.current ??= uuidv7();
      return saveCartAsDraft(cartStore, scope, { newDraftId: newId.current, asNew });
    },
    onSuccess: () => {
      newId.current = null;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: draftKeys.all }),
  });
}

/** A write to the linked draft failed because it changed, was submitted/discarded, or is gone. */
export function isDraftConflict(error: unknown): boolean {
  return isApiError(error, "REVISION_CONFLICT") || isApiError(error, "INVALID_STATE") || (isApiError(error) && error.status === 404);
}

/**
 * Replaces the cart with the latest shared version of its linked draft (explicit user choice after
 * a conflict). If the draft is no longer OPEN, the cart keeps its lines and is simply unlinked.
 */
export function useLoadLatestDraft(scope: CartScope | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<Draft | null> => {
      if (!scope) return null;
      const link = cartStore.getState(scope).draft;
      if (!link) return null;
      let draft: Draft;
      try {
        draft = await qc.fetchQuery({ ...draftQueries.detail(link.id), staleTime: 0 });
      } catch (error) {
        if (isApiError(error) && error.status === 404) {
          cartStore.linkDraft(scope, null);
          return null;
        }
        throw error;
      }
      if (draft.state !== "OPEN") {
        cartStore.linkDraft(scope, null);
        return draft;
      }
      const snapshots: Record<string, CartLineSnapshot> = {};
      for (const line of cartStore.getState(scope).lines) if (line.snapshot) snapshots[line.productId] = line.snapshot;
      const pending = cartStore.getState(scope).pendingSubmission;
      cartStore.replace(scope, { ...cartFromDraft(draft, snapshots), pendingSubmission: pending });
      return draft;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: draftKeys.all }),
  });
}
