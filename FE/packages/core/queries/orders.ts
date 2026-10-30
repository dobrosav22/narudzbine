import { api, data } from '../api/client';
import { addDays } from '../format';
import { counterpartId, fetchAllRelationships, fetchPartner } from './partners';
import type {
  CancellationRequest,
  ListOrderEventsPage,
  ListOrderMessagesPage,
  ListOrdersPage,
  Location,
  Message,
  Order,
  OrderEvent,
  OrderState,
  Partner,
  ReorderPreview,
  Role,
  Stage,
  StageList,
} from '../api/models.gen';

/*
 * Orders area (both sides): order history lists, the immutable order snapshot, lifecycle actions,
 * cancellation requests, the shared message thread, the event timeline, the vendor's custom
 * stage configuration and the buyer's read-only reorder preview. React-free; the apps wrap these
 * factories with TanStack Query (useQuery / useInfiniteQuery / useMutation).
 *
 * Contract rules that shape this module (openapi.yaml is the authority):
 * - Lifecycle actions carry the Order `expectedRevision`; cancellation request resolution carries
 *   the CancellationRequest revision. No Idempotency-Key except for new messages.
 * - Lists, events and messages are cursor pages (`cursor`/`size` → `nextCursor`); a cursor is bound
 *   to the exact filters and size, so the filter object is part of the query key.
 * - Core lifecycle states are fixed backend states; custom stages are optional labels inside ACCEPTED.
 */

// ── States, tones and progress ──────────────────────────────────────────

export const ORDER_STATES: readonly OrderState[] = [
  'AWAITING_ACCEPTANCE',
  'ACCEPTED',
  'DISPATCHED',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
];

/** States after which nothing changes any more (terminal records never reopen). */
export function isTerminalOrderState(state: OrderState): boolean {
  return state === 'DELIVERED' || state === 'REJECTED' || state === 'CANCELLED';
}

/** Badge tone per state — semantic colours, never the brand violet (05 §1). Same names on web and mobile. */
export type OrderStateTone = 'warning' | 'info' | 'success' | 'destructive' | 'secondary';

export function orderStateTone(state: OrderState): OrderStateTone {
  switch (state) {
    case 'AWAITING_ACCEPTANCE':
      return 'warning';
    case 'ACCEPTED':
    case 'DISPATCHED':
      return 'info';
    case 'DELIVERED':
      return 'success';
    case 'REJECTED':
      return 'destructive';
    case 'CANCELLED':
      return 'secondary';
  }
}

export type ProgressStepState = 'done' | 'current' | 'upcoming';
export type ProgressStep = { state: Exclude<OrderState, 'REJECTED' | 'CANCELLED'>; progress: ProgressStepState };

/**
 * The fixed happy path (submitted → accepted → dispatched → delivered). A rejected or cancelled
 * order has `ended` set and every step `upcoming`; the custom stage label (if any) belongs to the
 * ACCEPTED step and is shown by the screen next to it.
 */
export function orderProgress(state: OrderState): { steps: ProgressStep[]; ended: 'REJECTED' | 'CANCELLED' | null } {
  const path = ['AWAITING_ACCEPTANCE', 'ACCEPTED', 'DISPATCHED', 'DELIVERED'] as const;
  if (state === 'REJECTED' || state === 'CANCELLED') {
    return { steps: path.map((s) => ({ state: s, progress: 'upcoming' })), ended: state };
  }
  const at = path.indexOf(state);
  return {
    // Delivered is terminal: show it as done rather than "in progress".
    steps: path.map((s, i) => ({ state: s, progress: i < at || state === 'DELIVERED' ? 'done' : i === at ? 'current' : 'upcoming' })),
    ended: null,
  };
}

// ── Which actions the viewer may offer (the backend still decides) ──────

export type OrderViewer = {
  /** The viewer organization's side of this order. */
  side: 'BUYER' | 'VENDOR';
  role: Role | null;
  /** The buyer organization's staff submission/cancellation restriction (Organization.staffSubmissionRestricted). */
  staffSubmissionRestricted: boolean;
};

export type OrderActions = {
  accept: boolean;
  reject: boolean;
  setStage: boolean;
  dispatch: boolean;
  deliver: boolean;
  /** Direct cancellation: buyer before acceptance, vendor after acceptance and before dispatch. */
  cancel: boolean;
  requestCancellation: boolean;
  withdrawCancellation: boolean;
  approveCancellation: boolean;
  rejectCancellation: boolean;
  reorder: boolean;
  /** Start a replacement order for a cancelled one (buyer submission authority). */
  replace: boolean;
};

/** Buyer staff may submit/cancel unless the buyer organization restricts them. */
export function canSubmitOrCancel(viewer: OrderViewer): boolean {
  return viewer.side === 'BUYER' && (viewer.role !== 'STAFF' || !viewer.staffSubmissionRestricted);
}

/**
 * Controls to show for the order's current state and the viewer's role (DESIGN_SPEC / contract):
 * vendor owner/admin/staff respond, stage, dispatch, deliver and cancel accepted pre-dispatch
 * orders; a pending cancellation request blocks dispatch. Hiding a control is UX only.
 */
export function orderActions(order: Pick<Order, 'state' | 'cancellationRequestId'>, viewer: OrderViewer): OrderActions {
  const pending = order.cancellationRequestId !== null;
  const vendor = viewer.side === 'VENDOR';
  const buyerMay = canSubmitOrCancel(viewer);
  const s = order.state;
  return {
    accept: vendor && s === 'AWAITING_ACCEPTANCE',
    reject: vendor && s === 'AWAITING_ACCEPTANCE',
    setStage: vendor && s === 'ACCEPTED',
    dispatch: vendor && s === 'ACCEPTED' && !pending,
    deliver: vendor && s === 'DISPATCHED',
    cancel: vendor ? s === 'ACCEPTED' : buyerMay && s === 'AWAITING_ACCEPTANCE',
    requestCancellation: buyerMay && s === 'ACCEPTED' && !pending,
    withdrawCancellation: buyerMay && s === 'ACCEPTED' && pending,
    approveCancellation: vendor && s === 'ACCEPTED' && pending,
    rejectCancellation: vendor && s === 'ACCEPTED' && pending,
    reorder: viewer.side === 'BUYER',
    replace: buyerMay && s === 'CANCELLED',
  };
}

/** Vendor owner/admin configure stages; every vendor role reads and assigns them. */
export function canConfigureStages(role: Role | null): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

// ── Text limits (DESIGN_SPEC; the backend normalizes NFC/trim and is authoritative) ──

export const REASON_MAX = 1000;
export const MESSAGE_MAX = 4000;
export const STAGE_NAME_MAX = 100;
export const STAGE_LIMIT = 20;

/** Code points, as the backend counts them (not UTF-16 units). */
export function codePointLength(text: string): number {
  return [...text].length;
}

/** A trimmed, non-blank text within `max` code points. */
export function isValidText(text: string, max: number): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && codePointLength(trimmed) <= max;
}

// ── List filters ────────────────────────────────────────────────────────

export type OrderListFilter = {
  state?: OrderState;
  partnerId?: string;
  /** Inclusive country-local `YYYY-MM-DD` bounds on submittedAt. */
  from?: string;
  to?: string;
};

export type OrderDatePreset = 'all' | '7' | '30' | '90';
export const ORDER_DATE_PRESETS: readonly OrderDatePreset[] = ['all', '7', '30', '90'];

/** "Last N days" including today, in the organization's country calendar (`today` from localToday()). */
export function orderDateRange(preset: OrderDatePreset, today: string): Pick<OrderListFilter, 'from' | 'to'> {
  if (preset === 'all') return {};
  return { from: addDays(today, -(Number(preset) - 1)), to: today };
}

/** Drops empty values so the query key and the request match (strict query parameters). */
export function normalizeOrderFilter(filter: OrderListFilter): OrderListFilter {
  const out: OrderListFilter = {};
  if (filter.state) out.state = filter.state;
  if (filter.partnerId) out.partnerId = filter.partnerId;
  if (filter.from) out.from = filter.from;
  if (filter.to) out.to = filter.to;
  return out;
}

/** Reversed ranges are rejected by the backend (422); catch them before sending. */
export function isValidDateRange(filter: Pick<OrderListFilter, 'from' | 'to'>): boolean {
  return !filter.from || !filter.to || filter.from <= filter.to;
}

// ── Message / intent keys ───────────────────────────────────────────────

/**
 * A pending targeted-idempotency intent (new message). Reuse the key only to retry the exact same
 * body after an uncertain outcome; any other body is a new intent with a new key.
 */
export type PendingIntent<B> = { key: string; body: B };

export function intentFor<B>(pending: PendingIntent<B> | null, body: B, newKey: () => string, same: (a: B, b: B) => boolean = Object.is): PendingIntent<B> {
  return pending && same(pending.body, body) ? pending : { key: newKey(), body };
}

// ── Event timeline ──────────────────────────────────────────────────────

export type OrderEventKind =
  | 'SUBMITTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'STAGE_SET'
  | 'STAGE_CLEARED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLATION_DECLINED'
  | 'CANCELLATION_WITHDRAWN'
  | 'CANCELLATION_APPROVED'
  | 'UPDATED';

/**
 * What an actual immutable OrderEvent records (verified against the live backend): the first event
 * has no previous state; cancellation-request lifecycle events carry the request state (RESOLVED =
 * the vendor cancelled directly while a request was pending); stage changes keep ACCEPTED.
 */
export function orderEventKind(
  event: Pick<OrderEvent, 'state' | 'previousState' | 'stageId' | 'previousStageId' | 'cancellationRequestState'>,
): OrderEventKind {
  if (event.previousState === null) return 'SUBMITTED';
  switch (event.cancellationRequestState) {
    case 'PENDING':
      return 'CANCELLATION_REQUESTED';
    case 'REJECTED':
      return 'CANCELLATION_DECLINED';
    case 'WITHDRAWN':
      return 'CANCELLATION_WITHDRAWN';
    case 'APPROVED':
      return 'CANCELLATION_APPROVED';
    case 'RESOLVED':
      return 'CANCELLED';
    default:
      break;
  }
  if (event.state !== event.previousState) {
    return event.state === 'AWAITING_ACCEPTANCE' ? 'UPDATED' : event.state;
  }
  if (event.stageId !== event.previousStageId) return event.stageId ? 'STAGE_SET' : 'STAGE_CLEARED';
  return 'UPDATED';
}

// ── Display helpers ─────────────────────────────────────────────────────

/** The other party of an order from the viewer's side (its frozen PartySnapshot). */
export function orderPartner(order: Pick<Order, 'vendor' | 'buyer'>, side: 'BUYER' | 'VENDOR') {
  return side === 'BUYER' ? order.vendor : order.buyer;
}

// ── Query keys ──────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => ['orders', 'list'] as const,
  list: (filter: OrderListFilter) => ['orders', 'list', normalizeOrderFilter(filter)] as const,
  detail: (orderId: string) => ['orders', 'detail', orderId] as const,
  events: (orderId: string) => ['orders', 'events', orderId] as const,
  messages: (orderId: string) => ['orders', 'messages', orderId] as const,
  cancellationRequest: (orderId: string, requestId: string) => ['orders', 'cancellationRequest', orderId, requestId] as const,
  reorderPreview: (orderId: string) => ['orders', 'reorderPreview', orderId] as const,
  partners: () => ['orders', 'partners'] as const,
  fulfillmentLocations: () => ['orders', 'fulfillmentLocations'] as const,
  stages: () => ['orders', 'stages'] as const,
};

type Cursor = string | null;
const cursorPage = <P extends { nextCursor: string | null }>(page: P): Cursor => page.nextCursor;

// ── Query option factories ──────────────────────────────────────────────

export const orderQueries = {
  /** GET /orders — cursor pages, submittedAt DESC. Use with useInfiniteQuery. */
  list: (filter: OrderListFilter) => {
    const query = normalizeOrderFilter(filter);
    return {
      queryKey: orderKeys.list(query),
      queryFn: ({ pageParam }: { pageParam: Cursor }): Promise<ListOrdersPage> =>
        data(api.GET('/orders', { params: { query: { ...query, size: PAGE_SIZE, ...(pageParam ? { cursor: pageParam } : {}) } } })),
      initialPageParam: null as Cursor,
      getNextPageParam: cursorPage<ListOrdersPage>,
    };
  },
  detail: (orderId: string) => ({
    queryKey: orderKeys.detail(orderId),
    queryFn: (): Promise<Order> => data(api.GET('/orders/{orderId}', { params: { path: { orderId } } })),
  }),
  /** GET /orders/{id}/events — chronological. Use with useInfiniteQuery. */
  events: (orderId: string) => ({
    queryKey: orderKeys.events(orderId),
    queryFn: ({ pageParam }: { pageParam: Cursor }): Promise<ListOrderEventsPage> =>
      data(
        api.GET('/orders/{orderId}/events', {
          params: { path: { orderId }, query: { size: 100, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    initialPageParam: null as Cursor,
    getNextPageParam: cursorPage<ListOrderEventsPage>,
  }),
  /** GET /orders/{id}/messages — chronological (oldest first). Use with useInfiniteQuery. */
  messages: (orderId: string) => ({
    queryKey: orderKeys.messages(orderId),
    queryFn: ({ pageParam }: { pageParam: Cursor }): Promise<ListOrderMessagesPage> =>
      data(
        api.GET('/orders/{orderId}/messages', {
          params: { path: { orderId }, query: { size: 100, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    initialPageParam: null as Cursor,
    getNextPageParam: cursorPage<ListOrderMessagesPage>,
  }),
  cancellationRequest: (orderId: string, requestId: string) => ({
    queryKey: orderKeys.cancellationRequest(orderId, requestId),
    queryFn: (): Promise<CancellationRequest> =>
      data(api.GET('/orders/{orderId}/cancellation-requests/{requestId}', { params: { path: { orderId, requestId } } })),
  }),
  /** Read-only: creates nothing, reserves nothing. Always fetched fresh when the buyer asks for it. */
  reorderPreview: (orderId: string) => ({
    queryKey: orderKeys.reorderPreview(orderId),
    queryFn: (): Promise<ReorderPreview> => data(api.GET('/orders/{orderId}/reorder-preview', { params: { path: { orderId } } })),
    staleTime: 0,
  }),
  /** Trading partners (active and disconnected) for the partner filter. */
  partners: () => ({
    queryKey: orderKeys.partners(),
    queryFn: listOrderPartners,
    staleTime: 5 * 60_000,
  }),
  /** The vendor's active own locations, selectable as the fulfillment location on acceptance. */
  fulfillmentLocations: () => ({
    queryKey: orderKeys.fulfillmentLocations(),
    queryFn: listActiveLocations,
  }),
  stages: () => ({
    queryKey: orderKeys.stages(),
    queryFn: (): Promise<StageList> => data(api.GET('/organization/order-stages')),
  }),
};

/** Flattens loaded cursor pages. */
export function pageItems<T>(pages: { items: T[] }[] | undefined): T[] {
  return pages ? pages.flatMap((p) => p.items) : [];
}

const MAX_PAGES = 20;

async function listOrderPartners(): Promise<Partner[]> {
  const me = await data(api.GET('/organization'));
  const ids = (await fetchAllRelationships()).map((r) => counterpartId(r, me.type));
  // No partner directory with names exists; one shared cached read per partner (BACKEND_GAPS L-1).
  const partners = await Promise.all([...new Set(ids)].map((id) => fetchPartner(id).catch(() => null)));
  return partners.filter((p): p is Partner => p !== null).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

async function listActiveLocations(): Promise<Location[]> {
  const out: Location[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await data(api.GET('/organization/locations', { params: { query: { size: 100, page, state: 'ACTIVE' } } }));
    out.push(...result.items);
    if (result.items.length < 100) break;
  }
  return out;
}

// ── Mutations: vendor response and fulfilment ───────────────────────────

const orderPath = (orderId: string) => ({ params: { path: { orderId } } });

export function acceptOrder(input: { orderId: string; expectedRevision: string; fulfillmentLocationId: string | null }): Promise<Order> {
  return data(
    api.POST('/orders/{orderId}/acceptance', {
      ...orderPath(input.orderId),
      body: { expectedRevision: input.expectedRevision, fulfillmentLocationId: input.fulfillmentLocationId },
    }),
  );
}

export function rejectOrder(input: { orderId: string; expectedRevision: string; reason: string }): Promise<Order> {
  return data(
    api.POST('/orders/{orderId}/rejection', {
      ...orderPath(input.orderId),
      body: { expectedRevision: input.expectedRevision, reason: input.reason.trim() },
    }),
  );
}

/** Buyer (before acceptance) or vendor (accepted, before dispatch) direct cancellation. */
export function cancelOrder(input: { orderId: string; expectedRevision: string; reason: string }): Promise<Order> {
  return data(
    api.POST('/orders/{orderId}/cancellation', {
      ...orderPath(input.orderId),
      body: { expectedRevision: input.expectedRevision, reason: input.reason.trim() },
    }),
  );
}

/** `stageId: null` returns the order to plain Accepted. */
export function setOrderStage(input: { orderId: string; expectedRevision: string; stageId: string | null }): Promise<Order> {
  return data(
    api.POST('/orders/{orderId}/stage', {
      ...orderPath(input.orderId),
      body: { expectedRevision: input.expectedRevision, stageId: input.stageId },
    }),
  );
}

export function dispatchOrder(input: { orderId: string; expectedRevision: string }): Promise<Order> {
  return data(api.POST('/orders/{orderId}/dispatch', { ...orderPath(input.orderId), body: { expectedRevision: input.expectedRevision } }));
}

export function deliverOrder(input: { orderId: string; expectedRevision: string }): Promise<Order> {
  return data(api.POST('/orders/{orderId}/delivery', { ...orderPath(input.orderId), body: { expectedRevision: input.expectedRevision } }));
}

// ── Mutations: cancellation requests ────────────────────────────────────

/** Buyer request on an accepted, undispatched order. `expectedRevision` is the ORDER revision. */
export function requestCancellation(input: { orderId: string; expectedRevision: string; reason: string }): Promise<CancellationRequest> {
  return data(
    api.POST('/orders/{orderId}/cancellation-requests', {
      ...orderPath(input.orderId),
      body: { expectedRevision: input.expectedRevision, reason: input.reason.trim() },
    }),
  );
}

type RequestRef = { orderId: string; requestId: string; /** The CANCELLATION REQUEST revision. */ expectedRevision: string };
const requestPath = (r: RequestRef) => ({ params: { path: { orderId: r.orderId, requestId: r.requestId } } });

export function withdrawCancellation(input: RequestRef): Promise<CancellationRequest> {
  return data(
    api.POST('/orders/{orderId}/cancellation-requests/{requestId}/withdrawal', {
      ...requestPath(input),
      body: { expectedRevision: input.expectedRevision },
    }),
  );
}

export function approveCancellation(input: RequestRef): Promise<CancellationRequest> {
  return data(
    api.POST('/orders/{orderId}/cancellation-requests/{requestId}/approval', {
      ...requestPath(input),
      body: { expectedRevision: input.expectedRevision },
    }),
  );
}

export function rejectCancellation(input: RequestRef & { reason: string }): Promise<CancellationRequest> {
  return data(
    api.POST('/orders/{orderId}/cancellation-requests/{requestId}/rejection', {
      ...requestPath(input),
      body: { expectedRevision: input.expectedRevision, reason: input.reason.trim() },
    }),
  );
}

// ── Mutations: messages ─────────────────────────────────────────────────

/** New message with its UUIDv4 Idempotency-Key (keep the key for an uncertain-outcome retry of the same text). */
export function createOrderMessage(input: { orderId: string; text: string; idempotencyKey: string }): Promise<Message> {
  return data(
    api.POST('/orders/{orderId}/messages', {
      params: { path: { orderId: input.orderId }, header: { 'Idempotency-Key': input.idempotencyKey } },
      body: { text: input.text },
    }),
  );
}

// ── Mutations: custom stage configuration (vendor owner/admin) ──────────

/** `id` is a client UUIDv7 generated once per creation intent and reused on retries. */
export function createOrderStage(input: { id: string; name: string }): Promise<Stage> {
  return data(api.POST('/organization/order-stages', { body: { id: input.id, name: input.name.trim() } }));
}

/** `expectedRevision` is the STAGE revision. */
export function renameOrderStage(input: { stageId: string; expectedRevision: string; name: string }): Promise<Stage> {
  return data(
    api.PUT('/organization/order-stages/{stageId}', {
      params: { path: { stageId: input.stageId } },
      body: { expectedRevision: input.expectedRevision, name: input.name.trim() },
    }),
  );
}

/** A complete permutation of every retained stage id (retired included); `expectedRevision` is the LIST revision. */
export function reorderOrderStages(input: { expectedRevision: string; stageIds: string[] }): Promise<StageList> {
  return data(api.PUT('/organization/order-stages/order', { body: { expectedRevision: input.expectedRevision, stageIds: input.stageIds } }));
}

/** Permanent: retired stages can be renamed/reordered but never assigned again or restored. */
export function retireOrderStage(input: { stageId: string; expectedRevision: string }): Promise<Stage> {
  return data(
    api.POST('/organization/order-stages/{stageId}/retirement', {
      params: { path: { stageId: input.stageId } },
      body: { expectedRevision: input.expectedRevision },
    }),
  );
}

/** Moves one id by ±1 within a full ordering (for the reorder buttons). */
export function moveStageId(ids: readonly string[], index: number, delta: -1 | 1): string[] {
  const target = index + delta;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Stages in configured position order. */
export function sortedStages(list: Pick<StageList, 'stages'>): Stage[] {
  return [...list.stages].sort((a, b) => a.position - b.position);
}

/** True when a name is already used (case-insensitive, retired included) by another stage. */
export function isDuplicateStageName(stages: readonly Stage[], name: string, exceptId?: string): boolean {
  const n = name.trim().normalize('NFC').toLocaleLowerCase();
  return stages.some((s) => s.id !== exceptId && s.name.normalize('NFC').toLocaleLowerCase() === n);
}
