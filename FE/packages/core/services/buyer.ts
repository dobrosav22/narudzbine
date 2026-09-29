import type { BuyerFavorite, DraftCart, SaveDraftCartInput } from '../types';

/** GET/POST/DELETE /buyer-users/:id/favorites */
export interface FavoritesService {
  list(buyerUserId: string): Promise<BuyerFavorite[]>;
  /** Returns the new state: true = now favorited. */
  toggle(buyerUserId: string, productId: string): Promise<boolean>;
}

/**
 * /buyer-orgs/:id/draft-carts?vendorOrgId=
 * The live cart is app-side state (see each app's cart context); this service
 * only persists parked carts.
 */
export interface DraftCartsService {
  /** Whole org's drafts for this vendor; if currentUserId is given, that user's drafts sort first. */
  list(params: { buyerOrgId: string; vendorOrgId: string; currentUserId?: string }): Promise<DraftCart[]>;
  get(draftCartId: string): Promise<DraftCart>;
  save(input: SaveDraftCartInput): Promise<DraftCart>;
  discard(draftCartId: string): Promise<void>;
}
