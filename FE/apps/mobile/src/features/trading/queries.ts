
import { keepPreviousData, useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  confirmRelationshipAgreedPrices,
  data,
  disconnectRelationship,
  inviteBuyer,
  planKeys,
  reportKeys,
  resendBuyerInvitation,
  revokeBuyerInvitation,
  tradingKeys,
  tradingQueries,
  type BuyerInvitationState,
  type Relationship,
  type RelationshipQuery,
  type RelationshipState,
} from '@repo/core';

export function useRelationships(q: RelationshipQuery) {
  return useQuery({ ...tradingQueries.relationships(q), placeholderData: keepPreviousData });
}

const PAGE = 25;

/** Offset pages as an endless list (mobile "load more"). */
export function useRelationshipPages(state: RelationshipState) {
  return useInfiniteQuery({
    queryKey: [...tradingKeys.relationships({ state, size: PAGE }), 'infinite'] as const,
    queryFn: ({ pageParam }) => tradingQueries.relationships({ state, page: pageParam, size: PAGE }).queryFn(),
    initialPageParam: 0,
    getNextPageParam: (last, _all, lastPage) => (last.items.length === PAGE ? lastPage + 1 : undefined),
  });
}

export function useRelationship(relationshipId: string) {
  return useQuery(tradingQueries.relationship(relationshipId));
}

/** Partner identity/contact; one request per counterparty, cached for minutes (no batch endpoint — see gaps). */
export function usePartner(organizationId: string | undefined) {
  return useQuery({ ...tradingQueries.partner(organizationId ?? ''), enabled: !!organizationId });
}

export function useBuyerInvitations(state: BuyerInvitationState | undefined, enabled = true) {
  return useQuery({ ...tradingQueries.buyerInvitations(state), enabled });
}

export function useAgreedPrices(relationshipId: string, enabled = true) {
  return useQuery({ ...tradingQueries.agreedPrices(relationshipId), enabled });
}

/** Names of the vendor's own products referenced by agreed prices (GET /catalogue/products/{id} each). */
export function useOwnProductNames(productIds: string[]) {
  return useQueries({
    queries: productIds.map((productId) => ({
      queryKey: ['trading', 'product', productId] as const,
      queryFn: () => data(api.GET('/catalogue/products/{productId}', { params: { path: { productId } } })),
      staleTime: 5 * 60_000,
    })),
    combine: (results) => new Map(results.flatMap((r) => (r.data ? [[r.data.id, { name: r.data.name, sku: r.data.sku }] as const] : []))),
  });
}

function useStoreRelationship() {
  const qc = useQueryClient();
  return (relationship: Relationship) => {
    qc.setQueryData(tradingKeys.relationship(relationship.id), relationship);
    void qc.invalidateQueries({ queryKey: tradingKeys.all });
  };
}

export function useDisconnect() {
  const qc = useQueryClient();
  const store = useStoreRelationship();
  return useMutation({
    mutationFn: disconnectRelationship,
    onSuccess: (relationship) => {
      store(relationship);
      // Disconnection frees active-buyer capacity and changes the report's active buyer count.
      void qc.invalidateQueries({ queryKey: planKeys.all });
      void qc.invalidateQueries({ queryKey: reportKeys.all });
    },
  });
}

export function useInviteBuyer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: inviteBuyer,
    onSuccess: () => qc.invalidateQueries({ queryKey: tradingKeys.invitations(undefined).slice(0, 2) }),
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokeBuyerInvitation,
    onSettled: () => qc.invalidateQueries({ queryKey: tradingKeys.invitations(undefined).slice(0, 2) }),
  });
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resendBuyerInvitation,
    onSettled: () => qc.invalidateQueries({ queryKey: tradingKeys.invitations(undefined).slice(0, 2) }),
  });
}

export function useConfirmAgreedPrices() {
  const store = useStoreRelationship();
  return useMutation({ mutationFn: confirmRelationshipAgreedPrices, onSuccess: store });
}
