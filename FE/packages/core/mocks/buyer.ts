import type { DraftCartsService, FavoritesService } from '../services';
import type { DraftCart } from '../types';
import { db } from './db';
import { clone, delay, findOrThrow, newId, nowIso } from './util';

export const favoritesService: FavoritesService = {
  async list(buyerUserId) {
    await delay();
    return clone(db.favorites.filter((f) => f.buyerUserId === buyerUserId));
  },
  async toggle(buyerUserId, productId) {
    await delay(120);
    const existing = db.favorites.find((f) => f.buyerUserId === buyerUserId && f.productId === productId);
    if (existing) {
      db.favorites = db.favorites.filter((f) => f !== existing);
      return false;
    }
    db.favorites.push({ id: newId('fav'), buyerUserId, productId });
    return true;
  },
};

// Draft carts never expire in the mock (01 §11 open question — BUILD_LOG 2026-09-27).
export const draftCartsService: DraftCartsService = {
  async list({ buyerOrgId, vendorOrgId, currentUserId }) {
    await delay();
    const mineFirst = (d: DraftCart) => (d.createdByUserId === currentUserId ? 0 : 1);
    return clone(
      db.draftCarts
        .filter((d) => d.buyerOrgId === buyerOrgId && d.vendorOrgId === vendorOrgId)
        .sort((a, b) => mineFirst(a) - mineFirst(b) || b.updatedAt.localeCompare(a.updatedAt)),
    );
  },
  async get(draftCartId) {
    await delay();
    return clone(findOrThrow(db.draftCarts, (d) => d.id === draftCartId, 'Draft cart'));
  },
  async save(input) {
    await delay();
    const items = input.items.filter((i) => i.quantity > 0);
    if (input.id) {
      const draft = findOrThrow(db.draftCarts, (d) => d.id === input.id, 'Draft cart');
      Object.assign(draft, { locationId: input.locationId, items, updatedAt: nowIso() });
      return clone(draft);
    }
    const draft: DraftCart = { ...input, items, id: newId('dc'), updatedAt: nowIso() };
    db.draftCarts.push(draft);
    return clone(draft);
  },
  async discard(draftCartId) {
    await delay();
    db.draftCarts = db.draftCarts.filter((d) => d.id !== draftCartId);
  },
};
