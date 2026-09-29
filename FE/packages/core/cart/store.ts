import type { KeyValueStorage } from '../session/store';
import type { CartLine } from '../types';

/**
 * The live cart (02 → "Cart context"): one per buyer org + vendor — never a
 * cross-vendor cart (01 §1) — scoped to a delivery location. Kept separate
 * from draft carts (services.draftCarts); `draftCartId` only records which
 * draft this cart was resumed from, so parking updates that draft and placing
 * the order removes it. Framework-free; each app wraps it with
 * useSyncExternalStore.
 *
 * Stores only productId + quantity. Prices are always re-resolved when shown
 * (loadCartPricing), so a cart left overnight never shows yesterday's price.
 */
export interface CartScope {
  buyerOrgId: string;
  vendorOrgId: string;
}

export interface CartState {
  lines: CartLine[];
  /** Buyer delivery Location chosen for this cart. */
  locationId?: string;
  /** Set when the cart was resumed from (or parked as) a draft. */
  draftCartId?: string;
}

export interface CartStore {
  /** Stable reference until that scope's cart changes (safe for useSyncExternalStore). */
  getState(scope: CartScope): CartState;
  getLines(scope: CartScope): CartLine[];
  subscribe(listener: () => void): () => void;
  /** Load the persisted cart for a scope; safe to call repeatedly. */
  hydrate(scope: CartScope): Promise<void>;
  /** Adds to any quantity already in the cart. */
  add(scope: CartScope, productId: string, quantity: number): void;
  /** 0 or less removes the line. */
  setQuantity(scope: CartScope, productId: string, quantity: number): void;
  remove(scope: CartScope, productId: string): void;
  setLocation(scope: CartScope, locationId: string | undefined): void;
  /** Replace the whole cart (reorder, resuming a draft). */
  replace(scope: CartScope, next: CartState): void;
  /** Empty the cart and forget the draft link; keeps the chosen location. */
  clear(scope: CartScope): void;
}

const EMPTY: CartState = { lines: [] };
const storageKey = (s: CartScope) => `narudzbine.cart.${s.buyerOrgId}.${s.vendorOrgId}`;
const scopeKey = (s: CartScope) => `${s.buyerOrgId}|${s.vendorOrgId}`;

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

function isLine(l: unknown): l is CartLine {
  return (
    typeof l === 'object' &&
    l !== null &&
    typeof (l as CartLine).productId === 'string' &&
    Number.isInteger((l as CartLine).quantity) &&
    (l as CartLine).quantity > 0
  );
}

/** Accepts the current shape and Phase 3's bare line array. */
function parseState(raw: string | null): CartState {
  if (!raw) return EMPTY;
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) return { lines: parsed.filter(isLine) };
  if (typeof parsed !== 'object' || parsed === null) return EMPTY;
  const p = parsed as Partial<CartState>;
  return {
    lines: Array.isArray(p.lines) ? p.lines.filter(isLine) : [],
    ...(typeof p.locationId === 'string' ? { locationId: p.locationId } : {}),
    ...(typeof p.draftCartId === 'string' ? { draftCartId: p.draftCartId } : {}),
  };
}

export function createCartStore(storage: KeyValueStorage): CartStore {
  const carts = new Map<string, CartState>();
  const hydrating = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();

  const current = (scope: CartScope) => carts.get(scopeKey(scope)) ?? EMPTY;
  const write = (scope: CartScope, next: CartState) => {
    const lines = next.lines.filter((l) => l.quantity > 0);
    const state: CartState = {
      lines,
      ...(next.locationId ? { locationId: next.locationId } : {}),
      ...(next.draftCartId ? { draftCartId: next.draftCartId } : {}),
    };
    const isEmpty = !lines.length && !state.locationId && !state.draftCartId;
    carts.set(scopeKey(scope), isEmpty ? EMPTY : state);
    for (const l of listeners) l();
    // Persist in the background; a failed write only loses the cart on restart.
    const persisted = isEmpty ? storage.removeItem(storageKey(scope)) : storage.setItem(storageKey(scope), JSON.stringify(state));
    void persisted.catch(() => undefined);
  };
  const withLines = (scope: CartScope, lines: CartLine[]) => write(scope, { ...current(scope), lines });

  return {
    getState: current,
    getLines: (scope) => current(scope).lines,
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
          let state = EMPTY;
          try {
            state = parseState(await storage.getItem(storageKey(scope)));
          } catch {
            // Corrupt or unreadable storage → start with an empty cart.
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
    add(scope, productId, quantity) {
      if (quantity <= 0) return;
      const lines = current(scope).lines;
      const existing = lines.find((l) => l.productId === productId);
      withLines(
        scope,
        existing
          ? lines.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + quantity } : l))
          : [...lines, { productId, quantity }],
      );
    },
    setQuantity(scope, productId, quantity) {
      withLines(
        scope,
        current(scope).lines.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(0, Math.floor(quantity)) } : l)),
      );
    },
    remove(scope, productId) {
      withLines(scope, current(scope).lines.filter((l) => l.productId !== productId));
    },
    setLocation(scope, locationId) {
      write(scope, { ...current(scope), locationId });
    },
    replace(scope, next) {
      write(scope, {
        lines: next.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        locationId: next.locationId,
        draftCartId: next.draftCartId,
      });
    },
    clear(scope) {
      write(scope, { lines: [], locationId: current(scope).locationId });
    },
  };
}
