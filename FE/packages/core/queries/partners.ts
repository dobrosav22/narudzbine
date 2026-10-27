import { api, data } from '../api/client';
import { isApiError } from '../api/problem';
import type { Partner, Relationship } from '../api/models';

/**
 * Trading-partner reads shared by every area (vendor switcher, buyers/vendors lists, order
 * filters, agreed prices). The backend has no partner directory with names, so each partner is
 * one `GET /partners/{id}` (docs/frontend/backend-gaps.md L-1). This module keeps a single short-lived cache
 * so the same partner is fetched once even when several screens and queries need it.
 */

const TTL_MS = 5 * 60_000;
const RELATIONSHIP_PAGE_LIMIT = 20;
const cache = new Map<string, { at: number; value: Promise<Partner> }>();

/** One partner's approved identity (frozen snapshot after disconnection). Rejects like the API. */
export function fetchPartner(organizationId: string, now: number = Date.now()): Promise<Partner> {
  const hit = cache.get(organizationId);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = data(api.GET('/partners/{organizationId}', { params: { path: { organizationId } } }));
  cache.set(organizationId, { at: now, value });
  // Failures are never cached: the next caller retries.
  value.catch(() => {
    if (cache.get(organizationId)?.value === value) cache.delete(organizationId);
  });
  return value;
}

/** Like fetchPartner, but a partner the viewer can no longer read (404) is null. */
export async function fetchPartnerOrNull(organizationId: string): Promise<Partner | null> {
  try {
    return await fetchPartner(organizationId);
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) return null;
    throw error;
  }
}

/** Forget cached partners — on sign-in/out, and after connecting or disconnecting. */
export function resetPartnerCache(): void {
  cache.clear();
}

/** Every relationship of the own organization (all pages, bounded), optionally in one state. */
export async function fetchAllRelationships(state?: Relationship['state']): Promise<Relationship[]> {
  const all: Relationship[] = [];
  for (let page = 0; page < RELATIONSHIP_PAGE_LIMIT; page++) {
    const result = await data(api.GET('/relationships', { params: { query: { size: 100, page, ...(state ? { state } : {}) } } }));
    all.push(...result.items);
    if (result.items.length < 100) break;
  }
  return all;
}

/** The counterpart organization id of a relationship for the given own organization type. */
export function counterpartId(relationship: Relationship, own: 'BUYER' | 'VENDOR'): string {
  return own === 'BUYER' ? relationship.vendorId : relationship.buyerId;
}
