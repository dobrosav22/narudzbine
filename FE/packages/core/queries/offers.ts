import { api, data } from '../api/client';
import { compareMoney } from '../money';
import { fetchAllRelationships, fetchPartnerOrNull } from './partners';
import type { Favorite, NamedReference, Offer, Partner, PriceResolution } from '../api/models.gen';

/**
 * Buyer side of the catalogue: which vendors the buyer is connected to (vendor context), the active
 * vendor's buyer-specific offers, filter taxonomy, shelves and organization-shared favorites.
 *
 *   GET /relationships?state=ACTIVE  + GET /partners/{vendorId}   → connected vendors
 *   GET /vendors/{vendorId}/offers                                → browse (offset pages)
 *   GET /vendors/{vendorId}/offers/{productId}?quantity=          → product detail priced at a quantity
 *   GET /vendors/{vendorId}/offer-taxonomy                        → category/tag filters (cursor pages)
 *   GET /suggestions/most-ordered?vendorId=                       → "your most ordered" shelf
 *   GET/PUT/DELETE /favorites[/{productId}]                       → shared favorites
 *
 * Every price is NET_EXCLUDING_VAT and only a current-time estimate; the order review is the quote.
 */

export interface ConnectedVendor {
  vendorId: string;
  relationshipId: string;
  displayName: string;
  legalName: string;
  currency: Partner['currency'];
  country: Partner['country'];
}

export type OfferSort = 'NAME_ASC' | 'CREATED_DESC';

export interface OfferFilters {
  q?: string;
  sort?: OfferSort;
  categoryId?: string;
  tagId?: string;
  featured?: boolean;
}

export interface OfferTaxonomy {
  categories: NamedReference[];
  tags: NamedReference[];
}

const PAGE_SIZE = 24;

export const offerKeys = {
  all: ['offers'] as const,
  vendors: () => ['offers', 'vendors'] as const,
  vendor: (vendorId: string) => ['offers', 'vendor', vendorId] as const,
  list: (vendorId: string, filters: OfferFilters) => ['offers', 'vendor', vendorId, 'list', normalizeFilters(filters)] as const,
  detail: (vendorId: string, productId: string, quantity?: number) =>
    ['offers', 'vendor', vendorId, 'detail', productId, quantity ?? null] as const,
  taxonomy: (vendorId: string) => ['offers', 'vendor', vendorId, 'taxonomy'] as const,
  featured: (vendorId: string) => ['offers', 'vendor', vendorId, 'featured'] as const,
  mostOrdered: (vendorId: string) => ['offers', 'vendor', vendorId, 'mostOrdered'] as const,
  favorites: () => ['offers', 'favorites'] as const,
};

/** Drops empty values so equivalent filters share one cache entry and no empty params are sent. */
export function normalizeFilters(filters: OfferFilters): OfferFilters {
  const q = filters.q?.trim();
  return {
    ...(q ? { q: q.slice(0, 100) } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.tagId ? { tagId: filters.tagId } : {}),
    ...(filters.featured ? { featured: true } : {}),
  };
}

/** All ACTIVE relationships (buyer side) with the vendor's approved identity, in relationship order. */
export async function fetchConnectedVendors(): Promise<ConnectedVendor[]> {
  const relationships = await fetchAllRelationships('ACTIVE');
  // A partner disconnected between the two reads (404) is not a current vendor.
  const partners = await Promise.all(relationships.map((r) => fetchPartnerOrNull(r.vendorId)));
  return relationships.flatMap((r, i) => {
    const p = partners[i];
    if (!p || p.relationshipState !== 'ACTIVE') return [];
    return [{ vendorId: r.vendorId, relationshipId: r.id, displayName: p.displayName, legalName: p.legalName, currency: p.currency, country: p.country }];
  });
}

/**
 * The vendor whose catalogue should be open: the remembered one while it is still connected,
 * else the first connected vendor, else none.
 */
export function resolveActiveVendor(vendors: readonly ConnectedVendor[], activeVendorId: string | null): ConnectedVendor | null {
  return vendors.find((v) => v.vendorId === activeVendorId) ?? vendors[0] ?? null;
}

async function fetchTaxonomy(vendorId: string): Promise<OfferTaxonomy> {
  const categories: NamedReference[] = [];
  const tags: NamedReference[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i++) {
    const page = await data(
      api.GET('/vendors/{vendorId}/offer-taxonomy', { params: { path: { vendorId }, query: { size: 100, ...(cursor ? { cursor } : {}) } } }),
    );
    for (const item of page.items) (item.kind === 'CATEGORY' ? categories : tags).push({ id: item.id, name: item.name });
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  const byName = (a: NamedReference, b: NamedReference) => a.name.localeCompare(b.name);
  return { categories: categories.sort(byName), tags: tags.sort(byName) };
}

async function fetchAllFavorites(): Promise<Favorite[]> {
  const items: Favorite[] = [];
  for (let page = 0; page < 50; page++) {
    const result = await data(api.GET('/favorites', { params: { query: { size: 100, page } } }));
    items.push(...result.items);
    if (result.items.length < result.size) break;
  }
  return items;
}

export const offerQueries = {
  connectedVendors: () => ({ queryKey: offerKeys.vendors(), queryFn: fetchConnectedVendors, staleTime: 60_000 }),
  /** Offset pages for useInfiniteQuery; the first page asks for the total. */
  list: (vendorId: string, filters: OfferFilters) => {
    const query = normalizeFilters(filters);
    return {
      queryKey: offerKeys.list(vendorId, query),
      queryFn: ({ pageParam }: { pageParam: number }) =>
        data(
          api.GET('/vendors/{vendorId}/offers', {
            params: { path: { vendorId }, query: { ...query, size: PAGE_SIZE, page: pageParam, ...(pageParam === 0 ? { includeTotal: true } : {}) } },
          }),
        ),
      initialPageParam: 0,
      getNextPageParam: (last: { items: Offer[]; page: number; size: number }) => (last.items.length < last.size ? undefined : last.page + 1),
    };
  },
  /** One offer priced at `quantity` (default: the product minimum). The quantity must satisfy minimum/step. */
  detail: (vendorId: string, productId: string, quantity?: number) => ({
    queryKey: offerKeys.detail(vendorId, productId, quantity),
    queryFn: () =>
      data(
        api.GET('/vendors/{vendorId}/offers/{productId}', {
          params: { path: { vendorId, productId }, query: quantity ? { quantity } : {} },
        }),
      ),
  }),
  taxonomy: (vendorId: string) => ({ queryKey: offerKeys.taxonomy(vendorId), queryFn: () => fetchTaxonomy(vendorId), staleTime: 5 * 60_000 }),
  featured: (vendorId: string) => ({
    queryKey: offerKeys.featured(vendorId),
    queryFn: async () =>
      (await data(api.GET('/vendors/{vendorId}/offers', { params: { path: { vendorId }, query: { featured: true, sort: 'NAME_ASC', size: 12 } } }))).items,
  }),
  mostOrdered: (vendorId: string) => ({
    queryKey: offerKeys.mostOrdered(vendorId),
    queryFn: async () => (await data(api.GET('/suggestions/most-ordered', { params: { query: { vendorId, size: 12 } } }))).items,
  }),
  favorites: () => ({ queryKey: offerKeys.favorites(), queryFn: fetchAllFavorites }),
};

export function addFavorite(productId: string): Promise<Favorite> {
  return data(api.PUT('/favorites/{productId}', { params: { path: { productId } } }));
}

export async function removeFavorite(productId: string): Promise<void> {
  await data(api.DELETE('/favorites/{productId}', { params: { path: { productId } } }));
}

/** Favorites of one vendor (available ones carry the vendor on their offer) and the unavailable rest. */
export function splitFavorites(favorites: readonly Favorite[], vendorId: string | null): { current: Favorite[]; unavailable: Favorite[] } {
  return {
    current: favorites.filter((f) => f.available && f.offer && f.offer.vendorId === vendorId),
    unavailable: favorites.filter((f) => !f.available || !f.offer),
  };
}

// ── Price presentation (display only — the server resolves every price) ─────

export type PriceSource = 'PROMOTION' | 'AGREED' | 'TIER' | 'BASE';

/** Which rule produced the final unit price, by the backend's precedence (agreed, then best promotion). */
export function priceSource(price: PriceResolution): PriceSource {
  if (price.appliedPromotion) return 'PROMOTION';
  if (price.agreedUnitPrice !== null) return 'AGREED';
  if (price.reachedTierThreshold !== null) return 'TIER';
  return 'BASE';
}

/** True when the final unit price is below the base (list) price. */
export function isDiscounted(price: PriceResolution): boolean {
  return compareMoney(price.finalUnitPrice, price.baseUnitPrice) < 0;
}

export type OfferStockStatus = { kind: 'UNTRACKED' } | { kind: 'UNCONFIRMED' } | { kind: 'OUT' } | { kind: 'AVAILABLE'; quantity: number };

/** Buyer-visible availability: tracked counts only when confirmed; reads never reserve stock. */
export function offerStockStatus(offer: Pick<Offer, 'stockTracked' | 'availableQuantity'>): OfferStockStatus {
  if (!offer.stockTracked) return { kind: 'UNTRACKED' };
  if (offer.availableQuantity === null) return { kind: 'UNCONFIRMED' };
  if (offer.availableQuantity === 0) return { kind: 'OUT' };
  return { kind: 'AVAILABLE', quantity: offer.availableQuantity };
}
