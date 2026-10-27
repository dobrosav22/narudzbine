import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  acceptOrder,
  approveCancellation,
  cancelOrder,
  createOrderMessage,
  createOrderStage,
  deliverOrder,
  dispatchOrder,
  isUncertainOutcome,
  orderKeys,
  orderQueries,
  rejectCancellation,
  rejectOrder,
  renameOrderStage,
  reorderOrderStages,
  requestCancellation,
  retireOrderStage,
  setOrderStage,
  withdrawCancellation,
  type CancellationRequest,
  type Order,
  type OrderListFilter,
  type StageList,
} from '@repo/core';

/*
 * Orders hooks for both the buyer and the vendor screens (one module: the order resource, its
 * events, messages and cancellation requests are shared by both parties).
 */

export function useOrderList(filter: OrderListFilter, enabled = true) {
  return useInfiniteQuery({ ...orderQueries.list(filter), enabled, placeholderData: keepPreviousData });
}

export function useOrder(orderId: string) {
  return useQuery(orderQueries.detail(orderId));
}

export function useOrderEvents(orderId: string) {
  return useInfiniteQuery(orderQueries.events(orderId));
}

export function useOrderMessages(orderId: string) {
  return useInfiniteQuery({ ...orderQueries.messages(orderId), refetchInterval: 60_000 });
}

export function useCancellationRequest(orderId: string, requestId: string | null) {
  return useQuery({ ...orderQueries.cancellationRequest(orderId, requestId ?? ''), enabled: !!requestId });
}

export function useOrderPartners() {
  return useQuery(orderQueries.partners());
}

export function useFulfillmentLocations(enabled: boolean) {
  return useQuery({ ...orderQueries.fulfillmentLocations(), enabled });
}

export function useOrderStages(enabled = true) {
  return useQuery({ ...orderQueries.stages(), enabled });
}

/** After any lifecycle change: the response is the full current Order; lists and history are stale. */
function settleOrder(qc: QueryClient, order: Order) {
  qc.setQueryData(orderKeys.detail(order.id), order);
  return Promise.all([
    qc.invalidateQueries({ queryKey: orderKeys.lists() }),
    qc.invalidateQueries({ queryKey: orderKeys.events(order.id) }),
    // A direct vendor cancellation resolves a pending request.
    qc.invalidateQueries({ queryKey: ['orders', 'cancellationRequest', order.id] }),
  ]);
}

/** Cancellation requests return the request, not the order: refetch the order and its history. */
function settleRequest(qc: QueryClient, request: CancellationRequest) {
  qc.setQueryData(orderKeys.cancellationRequest(request.orderId, request.id), request);
  return Promise.all([
    qc.invalidateQueries({ queryKey: orderKeys.detail(request.orderId) }),
    qc.invalidateQueries({ queryKey: orderKeys.lists() }),
    qc.invalidateQueries({ queryKey: orderKeys.events(request.orderId) }),
  ]);
}

/**
 * A definite failure (409 REVISION_CONFLICT/INVALID_STATE, ...) means our copy may be stale: refetch so
 * the screen shows the truth. After an uncertain outcome keep the copy, so retrying sends the exact
 * same expectedRevision/body and the backend replays the original success.
 */
function refetchOnConflict(qc: QueryClient, orderId: string) {
  return (error: unknown) => {
    if (!isUncertainOutcome(error)) void qc.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
  };
}

function useOrderMutation<I extends { orderId: string }>(fn: (input: I) => Promise<Order>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (order) => settleOrder(qc, order),
    onError: (e, input) => refetchOnConflict(qc, input.orderId)(e),
  });
}

function useRequestMutation<I extends { orderId: string }>(fn: (input: I) => Promise<CancellationRequest>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (request) => settleRequest(qc, request),
    onError: (e, input) => refetchOnConflict(qc, input.orderId)(e),
  });
}

export const useAcceptOrder = () => useOrderMutation(acceptOrder);
export const useRejectOrder = () => useOrderMutation(rejectOrder);
export const useCancelOrder = () => useOrderMutation(cancelOrder);
export const useSetOrderStage = () => useOrderMutation(setOrderStage);
export const useDispatchOrder = () => useOrderMutation(dispatchOrder);
export const useDeliverOrder = () => useOrderMutation(deliverOrder);
export const useRequestCancellation = () => useRequestMutation(requestCancellation);
export const useWithdrawCancellation = () => useRequestMutation(withdrawCancellation);
export const useApproveCancellation = () => useRequestMutation(approveCancellation);
export const useRejectCancellation = () => useRequestMutation(rejectCancellation);

export function useSendOrderMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOrderMessage,
    onSuccess: (message) => qc.invalidateQueries({ queryKey: orderKeys.messages(message.orderId) }),
  });
}

// ── Custom stage configuration (vendor owner/admin) ──

function useStageMutation<I, R>(fn: (input: I) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      // Reorder returns the whole list; single-stage writes change the list revision too.
      if (result && typeof result === 'object' && 'stages' in result) qc.setQueryData(orderKeys.stages(), result as unknown as StageList);
      return qc.invalidateQueries({ queryKey: orderKeys.stages() });
    },
    onError: () => void qc.invalidateQueries({ queryKey: orderKeys.stages() }),
  });
}

export const useCreateStage = () => useStageMutation(createOrderStage);
export const useRenameStage = () => useStageMutation(renameOrderStage);
export const useReorderStages = () => useStageMutation(reorderOrderStages);
export const useRetireStage = () => useStageMutation(retireOrderStage);
