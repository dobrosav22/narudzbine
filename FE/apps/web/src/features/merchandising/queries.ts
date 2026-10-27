"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archivePromotion,
  createPromotion,
  promotionKeys,
  promotionQueries,
  stopPromotion,
  updatePromotion,
  type PromotionInput,
  type PromotionListQuery,
  type PromotionUpdate,
} from "@repo/core";

export function usePromotions(q: PromotionListQuery) {
  return useQuery({ ...promotionQueries.list(q), placeholderData: keepPreviousData });
}

/** Create/update/stop/archive; each refreshes every promotion list. */
export function usePromotionMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: promotionKeys.all });
  return {
    create: useMutation({ mutationFn: (body: PromotionInput) => createPromotion(body), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, body }: { id: string; body: PromotionUpdate }) => updatePromotion(id, body), onSuccess: refresh }),
    stop: useMutation({ mutationFn: ({ id, expectedRevision }: { id: string; expectedRevision: string }) => stopPromotion(id, expectedRevision), onSuccess: refresh }),
    archive: useMutation({
      mutationFn: ({ id, expectedRevision }: { id: string; expectedRevision: string }) => archivePromotion(id, expectedRevision),
      onSuccess: refresh,
    }),
  };
}
