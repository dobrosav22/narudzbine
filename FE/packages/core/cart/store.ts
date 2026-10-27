import type { KeyValueStorage } from '../session/store';
import type { Contact, Draft, DraftIntent, Offer, OrderIntent } from '../api/models.gen';

/**
 * The buyer's local cart. The backend has NO live cart (DESIGN_SPEC "No backend live carts"):
 * the cart is device-local preparation, one per (buyer organization, vendor), persisted on this
 * device only. It mirrors the backend's draft/order intent so it can be saved as a shared draft
 * (POST/PUT /drafts), reviewed (POST /order-reviews) and submitted (POST /orders or
 * POST /drafts/{id}/submission) without translation.
 *
 * Lines keep a display snapshot (name, SKU, unit, quantity rule, first image) from the offer they
 * were added from, so the cart renders instantly and still names a product that later becomes
 * unavailable. Prices are never stored: they are re-read from current offers and are only an
 * estimate until the order review returns the exact receipt.
 *
 * `draft` links the cart to the shared draft it was saved as or resumed from; saving updates that
 * draft with its expected revision and checkout submits through it (one-time consumption).
 * `pendingSubmission` remembers an in-flight order submission whose outcome is unknown (lost
 * response), so the exact same request — same reviewId and Idempotency-Key — can be retried and
 * reconciled instead of creating a duplicate order. Framework-free; each app wraps it with
 * useSyncExternalStore.
 */

export interface CartScope {
  buyerOrgId: string;
  vendorId: string;
}

export interface CartLineSnapshot {
  name: string;
  sku: string;
  unitName: string;
  packDescription: string | null;
  minimumQuantity: number;
  quantityStep: number;
  imageAssetId: string | null;
}

export interface CartLine {
  productId: string;
  quantity: number;
  /** Absent for lines that came from a draft before their offer was read. */
  snapshot?: CartLineSnapshot;
}

export type InstructionsMode = 'INHERIT' | 'OVERRIDE' | 'CLEAR';

/** Delivery and note choices that travel with the intent (DraftIntent/OrderIntent minus lines/vendor). */
export interface CartDetails {
  deliveryLocationId: string | null;
  contactOverride: Contact | null;
  instructionsMode: InstructionsMode;
  /** Only meaningful (and only sent) for OVERRIDE. */
  instructionsOverride: string | null;
  note: string | null;
  replacementForOrderId: string | null;
}

export interface CartDraftLink {
  id: string;
  /** Opaque revision from the last draft read/write; never decoded. */
  revision: string;
}

export type PendingSubmission =
  | { kind: 'ORDER'; reviewId: string; idempotencyKey: string; startedAt: string }
  | { kind: 'DRAFT'; reviewId: string; draftId: string; expectedRevision: string; startedAt: string };

export interface CartState extends CartDetails {
  lines: CartLine[];
  draft: CartDraftLink | null;
  pendingSubmission: PendingSubmission | null;
}

export const EMPTY_DETAILS: CartDetails = {
  deliveryLocationId: null,
  contactOverride: null,
  instructionsMode: 'INHERIT',
  instructionsOverride: null,
  note: null,
  replacementForOrderId: null,
};

export const EMPTY_CART: CartState = { ...EMPTY_DETAILS, lines: [], draft: null, pendingSubmission: null };

export interface CartStore {
  /** Stable reference until that scope's cart changes (safe for useSyncExternalStore). */
  getState(scope: CartScope): CartState;
  subscribe(listener: () => void): () => void;
  /** Load the persisted cart for a scope; safe to call repeatedly. */
  hydrate(scope: CartScope): Promise<void>;
  /** Adds to the quantity already in the cart (the caller validates the resulting quantity). */
  add(scope: CartScope, productId: string, quantity: number, snapshot?: CartLineSnapshot): void;
  /** 0 or less removes the line. */
  setQuantity(scope: CartScope, productId: string, quantity: number): void;
  remove(scope: CartScope, productId: string): void;
  /** Refresh display snapshots from current offers (names/rules change on the vendor side). */
  updateSnapshots(scope: CartScope, snapshots: Record<string, CartLineSnapshot>): void;
  updateDetails(scope: CartScope, patch: Partial<CartDetails>): void;
  linkDraft(scope: CartScope, link: CartDraftLink | null): void;
  setPendingSubmission(scope: CartScope, pending: PendingSubmission | null): void;
  /** Replace the whole cart (resuming a draft, reorder). */
  replace(scope: CartScope, next: CartState): void;
  /** Empty the cart, forget the draft link and pending submission; keeps the chosen delivery location. */
  clear(scope: CartScope): void;
}

const STORAGE_PREFIX = 'narudzbine.cart.v2';
const storageKey = (s: CartScope) => `${STORAGE_PREFIX}.${s.buyerOrgId}.${s.vendorId}`;
const scopeKey = (s: CartScope) => `${s.buyerOrgId}|${s.vendorId}`;

/** Distinct products in the cart (quantities are pack counts, so summing them means little). */
export function cartItemCount(lines: readonly CartLine[]): number {
  return lines.length;
}

export function snapshotFromOffer(offer: Offer): CartLineSnapshot {
  return {
    name: offer.product.name,
    sku: offer.product.sku,
    unitName: offer.unitName,
    packDescription: offer.product.packDescription,
    minimumQuantity: offer.product.minimumQuantity,
    quantityStep: offer.product.quantityStep,
    imageAssetId: offer.product.galleryAssetIds[0] ?? null,
  };
}

// ── Parsing persisted state (never trust storage) ─────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const posInt = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);

function parseSnapshot(v: unknown): CartLineSnapshot | undefined {
  if (!isObject(v)) return undefined;
  const name = str(v.name);
  const sku = str(v.sku);
  const unitName = str(v.unitName);
  const minimumQuantity = posInt(v.minimumQuantity);
  const quantityStep = posInt(v.quantityStep);
  if (!name || !sku || !unitName || !minimumQuantity || !quantityStep) return undefined;
  return { name, sku, unitName, packDescription: str(v.packDescription), minimumQuantity, quantityStep, imageAssetId: str(v.imageAssetId) };
}

function parseLine(v: unknown): CartLine | null {
  if (!isObject(v)) return null;
  const productId = str(v.productId);
  const quantity = posInt(v.quantity);
  if (!productId || !quantity) return null;
  const snapshot = parseSnapshot(v.snapshot);
  return snapshot ? { productId, quantity, snapshot } : { productId, quantity };
}

function parseContact(v: unknown): Contact | null {
  if (!isObject(v)) return null;
  const name = str(v.name);
  const phone = str(v.phone);
  if (!name || !phone) return null;
  return { name, phone, email: str(v.email) };
}

function parsePending(v: unknown): PendingSubmission | null {
  if (!isObject(v)) return null;
  const reviewId = str(v.reviewId);
  const startedAt = str(v.startedAt) ?? new Date(0).toISOString();
  if (!reviewId) return null;
  if (v.kind === 'ORDER' && str(v.idempotencyKey)) return { kind: 'ORDER', reviewId, idempotencyKey: v.idempotencyKey as string, startedAt };
  if (v.kind === 'DRAFT' && str(v.draftId) && str(v.expectedRevision)) {
    return { kind: 'DRAFT', reviewId, draftId: v.draftId as string, expectedRevision: v.expectedRevision as string, startedAt };
  }
  return null;
}

/** Exported for tests. Unknown or corrupt input yields an empty cart. */
export function parseCartState(raw: string | null): CartState {
  if (!raw) return EMPTY_CART;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_CART;
  }
  if (!isObject(parsed)) return EMPTY_CART;
  const mode = parsed.instructionsMode;
  const instructionsMode: InstructionsMode = mode === 'OVERRIDE' || mode === 'CLEAR' ? mode : 'INHERIT';
  const seen = new Set<string>();
  const lines = (Array.isArray(parsed.lines) ? parsed.lines : [])
    .map(parseLine)
    .filter((l): l is CartLine => l !== null && !seen.has(l.productId) && !!seen.add(l.productId));
  const draft = isObject(parsed.draft) && str(parsed.draft.id) && str(parsed.draft.revision)
    ? { id: parsed.draft.id as string, revision: parsed.draft.revision as string }
    : null;
  return {
    lines,
    deliveryLocationId: str(parsed.deliveryLocationId),
    contactOverride: parseContact(parsed.contactOverride),
    instructionsMode,
    instructionsOverride: instructionsMode === 'OVERRIDE' ? str(parsed.instructionsOverride) : null,
    note: str(parsed.note),
    replacementForOrderId: str(parsed.replacementForOrderId),
    draft,
    pendingSubmission: parsePending(parsed.pendingSubmission),
  };
}

function isEmpty(state: CartState): boolean {
  return (
    state.lines.length === 0 &&
    !state.draft &&
    !state.pendingSubmission &&
    !state.deliveryLocationId &&
    !state.contactOverride &&
    state.instructionsMode === 'INHERIT' &&
    !state.note &&
    !state.replacementForOrderId
  );
}

export function createCartStore(storage: KeyValueStorage): CartStore {
  const carts = new Map<string, CartState>();
  const hydrating = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();

  const current = (scope: CartScope) => carts.get(scopeKey(scope)) ?? EMPTY_CART;
  const write = (scope: CartScope, next: CartState) => {
    const state: CartState = { ...next, lines: next.lines.filter((l) => l.quantity > 0) };
    const empty = isEmpty(state);
    carts.set(scopeKey(scope), empty ? EMPTY_CART : state);
    for (const l of listeners) l();
    // Persist in the background; a failed write only loses the cart on restart.
    const persisted = empty ? storage.removeItem(storageKey(scope)) : storage.setItem(storageKey(scope), JSON.stringify(state));
    void persisted.catch(() => undefined);
  };
  const withLines = (scope: CartScope, lines: CartLine[]) => write(scope, { ...current(scope), lines });

  return {
    getState: current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate(scope) {
      const key = scopeKey(scope);
      if (carts.has(key)) return Promise.resolve();
      let pending = hydrating.get(key);
      if (!pending) {
        pending = (async () => {
          let state = EMPTY_CART;
          try {
            state = parseCartState(await storage.getItem(storageKey(scope)));
          } catch {
            // Unreadable storage → start with an empty cart.
          }
          // Don't clobber changes made while we were reading.
          if (!carts.has(key)) {
            carts.set(key, state);
            for (const l of listeners) l();
          }
        })();
        hydrating.set(key, pending);
      }
      return pending;
    },
    add(scope, productId, quantity, snapshot) {
      if (!Number.isInteger(quantity) || quantity <= 0) return;
      const lines = current(scope).lines;
      const existing = lines.find((l) => l.productId === productId);
      withLines(
        scope,
        existing
          ? lines.map((l) =>
              l.productId === productId ? { ...l, quantity: l.quantity + quantity, ...(snapshot ? { snapshot } : {}) } : l,
            )
          : [...lines, snapshot ? { productId, quantity, snapshot } : { productId, quantity }],
      );
    },
    setQuantity(scope, productId, quantity) {
      const next = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
      withLines(scope, current(scope).lines.map((l) => (l.productId === productId ? { ...l, quantity: next } : l)));
    },
    remove(scope, productId) {
      withLines(scope, current(scope).lines.filter((l) => l.productId !== productId));
    },
    updateSnapshots(scope, snapshots) {
      const lines = current(scope).lines;
      let changed = false;
      const next = lines.map((l) => {
        const s = snapshots[l.productId];
        if (!s || JSON.stringify(s) === JSON.stringify(l.snapshot)) return l;
        changed = true;
        return { ...l, snapshot: s };
      });
      if (changed) withLines(scope, next);
    },
    updateDetails(scope, patch) {
      const merged = { ...current(scope), ...patch };
      if (merged.instructionsMode !== 'OVERRIDE') merged.instructionsOverride = null;
      write(scope, merged);
    },
    linkDraft(scope, link) {
      write(scope, { ...current(scope), draft: link });
    },
    setPendingSubmission(scope, pending) {
      write(scope, { ...current(scope), pendingSubmission: pending });
    },
    replace(scope, next) {
      write(scope, { ...next, lines: next.lines.map((l) => ({ ...l })) });
    },
    clear(scope) {
      write(scope, { ...EMPTY_CART, deliveryLocationId: current(scope).deliveryLocationId });
    },
  };
}

// ── Intent conversion ─────────────────────────────────────────────────────

function trimmed(value: string | null): string | null {
  const t = value?.trim();
  return t ? t : null;
}

/** The cart as a shared-draft intent (empty lines and no location are allowed for drafts). */
export function draftIntentFromCart(state: CartState, vendorId: string): DraftIntent {
  const mode = state.instructionsMode;
  return {
    vendorId,
    lines: state.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    deliveryLocationId: state.deliveryLocationId,
    contactOverride: state.contactOverride,
    instructionsMode: mode,
    instructionsOverride: mode === 'OVERRIDE' ? trimmed(state.instructionsOverride) : null,
    note: trimmed(state.note),
    replacementForOrderId: state.replacementForOrderId,
  };
}

/** The cart as a reviewable order intent, or null when it has no lines or no delivery location. */
export function orderIntentFromCart(state: CartState, vendorId: string): OrderIntent | null {
  const intent = draftIntentFromCart(state, vendorId);
  if (!intent.deliveryLocationId || intent.lines.length === 0) return null;
  if (intent.instructionsMode === 'OVERRIDE' && !intent.instructionsOverride) return null;
  return { ...intent, deliveryLocationId: intent.deliveryLocationId };
}

/** A cart resumed from a shared draft, linked to it. Snapshots fill in once offers are read. */
export function cartFromDraft(draft: Draft, snapshots: Record<string, CartLineSnapshot> = {}): CartState {
  const i = draft.intent;
  return {
    lines: i.lines.map((l) => (snapshots[l.productId] ? { ...l, snapshot: snapshots[l.productId] } : { ...l })),
    deliveryLocationId: i.deliveryLocationId,
    contactOverride: i.contactOverride,
    instructionsMode: i.instructionsMode,
    instructionsOverride: i.instructionsMode === 'OVERRIDE' ? i.instructionsOverride : null,
    note: i.note,
    replacementForOrderId: i.replacementForOrderId,
    draft: { id: draft.id, revision: draft.revision },
    pendingSubmission: null,
  };
}

/** Lines of `incoming` added onto `existing` (quantities summed per product, order preserved). */
export function mergeCartLines(existing: readonly CartLine[], incoming: readonly CartLine[]): CartLine[] {
  const result = existing.map((l) => ({ ...l }));
  for (const line of incoming) {
    const match = result.find((l) => l.productId === line.productId);
    if (match) {
      match.quantity += line.quantity;
      if (line.snapshot) match.snapshot = line.snapshot;
    } else {
      result.push({ ...line });
    }
  }
  return result;
}
