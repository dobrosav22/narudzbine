import { api, data } from '../api/client';
import { fetchPartner, resetPartnerCache } from './partners';
import type { AgreedPrice, AgreedPriceConfirmation, Invitation, Partner, QueryOf, Relationship } from '../api/models';

/*
 * Trading relationships (vendor ↔ buyer), partner details, buyer invitations and the
 * vendor's agreed-price review after reconnection.
 *
 * Contract notes (openapi.yaml, FRONTEND_HANDOFF "Partner details", "Administrative connection
 * and disconnection", "Agreed buyer prices and reconnection confirmation"):
 *  - A Relationship carries only ids and state; the counterparty's name comes from
 *    GET /partners/{organizationId} (frozen snapshot after disconnection).
 *  - Disconnection needs the current relationship revision and a reason; no Idempotency-Key.
 *  - Buyer invitations: `buyerOrganizationId: null` invites a NEW buyer business (setup);
 *    an existing id sends a TRADING invitation — the vendor only knows ids of buyers it was
 *    connected to before, so that path is "reconnect a disconnected buyer".
 *  - Resending an invitation needs its revision and a UUIDv4 Idempotency-Key.
 *  - Agreed prices are vendor-only (uniform vendor price authority). Their confirmation takes
 *    the pricing and relationship revisions from one reviewed list snapshot.
 */

export type RelationshipQuery = QueryOf<'listRelationships'>;
export type RelationshipState = Relationship['state'];
export type BuyerInvitationState = Invitation['state'];

/** Invitation purposes the vendor's Buyers screen manages (MEMBER invitations belong to Team). */
export const BUYER_INVITATION_PURPOSES: readonly Invitation['purpose'][] = ['SETUP_BUYER', 'TRADING'];

export const tradingKeys = {
  all: ['trading'] as const,
  relationships: (q: RelationshipQuery) => ['trading', 'relationships', q] as const,
  relationship: (id: string) => ['trading', 'relationship', id] as const,
  partner: (organizationId: string) => ['trading', 'partner', organizationId] as const,
  invitations: (state: BuyerInvitationState | undefined) => ['trading', 'invitations', state ?? 'ALL'] as const,
  agreedPrices: (relationshipId: string) => ['trading', 'agreedPrices', relationshipId] as const,
};

/** The other party of a relationship, seen from the signed-in organization. */
export function relationshipCounterpartyId(relationship: Pick<Relationship, 'vendorId' | 'buyerId'>, ownOrganizationId: string): string {
  return relationship.vendorId === ownOrganizationId ? relationship.buyerId : relationship.vendorId;
}

export function isBuyerInvitation(invitation: Pick<Invitation, 'purpose'>): boolean {
  return BUYER_INVITATION_PURPOSES.includes(invitation.purpose);
}

/** Delivery that needs a person to act: the backend never retries failed/unknown invitation mail. */
export function buyerInviteNeedsResend(invitation: Pick<Invitation, 'state' | 'deliveryState'>): boolean {
  return invitation.state === 'PENDING' && (invitation.deliveryState === 'FAILED' || invitation.deliveryState === 'UNKNOWN');
}

const MAX_INVITATION_PAGES = 10;

/**
 * Buyer-related invitations in one state. GET /invitations mixes MEMBER invitations in and has no
 * purpose filter, so pages are read (bounded) and filtered here.
 */
export async function listBuyerInvitations(
  state: BuyerInvitationState | undefined,
  fetchPage: (page: number) => Promise<{ items: Invitation[] }> = (page) =>
    data(api.GET('/invitations', { params: { query: { page, size: 100, ...(state ? { state } : {}) } } })),
): Promise<Invitation[]> {
  const out: Invitation[] = [];
  for (let page = 0; page < MAX_INVITATION_PAGES; page++) {
    const result = await fetchPage(page);
    out.push(...result.items.filter(isBuyerInvitation));
    if (result.items.length < 100) break;
  }
  return out;
}

/** Every current agreed price of a relationship plus the review tokens of that same snapshot. */
export interface RelationshipAgreedPrices {
  items: AgreedPrice[];
  pricingRevision: string;
  relationshipRevision: string;
}

type AgreedPricePage = { items: AgreedPrice[]; pricingRevision: string; relationshipRevision: string };

const AGREED_PAGE_SIZE = 100;
const MAX_AGREED_PAGES = 10; // the backend caps a confirmation at 1000 products
const SNAPSHOT_ATTEMPTS = 3;

/**
 * Reads all pages and returns them only when every page carried the same pricing and
 * relationship revisions. Pages are separate statements, so an edit between pages would make
 * the earlier pages stale while the tokens are already new; confirming that view would accept
 * prices nobody reviewed. On a mismatch the whole read is repeated (bounded).
 */
export async function loadRelationshipAgreedPrices(
  relationshipId: string,
  fetchPage: (page: number) => Promise<AgreedPricePage> = (page) =>
    data(api.GET('/relationships/{relationshipId}/agreed-prices', { params: { path: { relationshipId }, query: { page, size: AGREED_PAGE_SIZE } } })),
): Promise<RelationshipAgreedPrices> {
  for (let attempt = 1; ; attempt++) {
    const pages: AgreedPricePage[] = [];
    for (let page = 0; page < MAX_AGREED_PAGES; page++) {
      const result = await fetchPage(page);
      pages.push(result);
      if (result.items.length < AGREED_PAGE_SIZE) break;
    }
    const first = pages[0]!;
    const consistent = pages.every((p) => p.pricingRevision === first.pricingRevision && p.relationshipRevision === first.relationshipRevision);
    if (consistent || attempt >= SNAPSHOT_ATTEMPTS) {
      if (!consistent) throw new Error('Agreed prices kept changing while they were being read.');
      return { items: pages.flatMap((p) => p.items), pricingRevision: first.pricingRevision, relationshipRevision: first.relationshipRevision };
    }
  }
}

export const tradingQueries = {
  relationships: (q: RelationshipQuery) => ({
    queryKey: tradingKeys.relationships(q),
    queryFn: () => data(api.GET('/relationships', { params: { query: q } })),
  }),
  relationship: (relationshipId: string) => ({
    queryKey: tradingKeys.relationship(relationshipId),
    queryFn: () => data(api.GET('/relationships/{relationshipId}', { params: { path: { relationshipId } } })),
  }),
  partner: (organizationId: string) => ({
    queryKey: tradingKeys.partner(organizationId),
    queryFn: (): Promise<Partner> => fetchPartner(organizationId),
    staleTime: 5 * 60_000,
  }),
  buyerInvitations: (state: BuyerInvitationState | undefined) => ({
    queryKey: tradingKeys.invitations(state),
    queryFn: () => listBuyerInvitations(state),
  }),
  agreedPrices: (relationshipId: string) => ({
    queryKey: tradingKeys.agreedPrices(relationshipId),
    queryFn: () => loadRelationshipAgreedPrices(relationshipId),
  }),
};

export function disconnectRelationship(input: { relationshipId: string; expectedRevision: string; reason: string }): Promise<Relationship> {
  return data(
    api.POST('/relationships/{relationshipId}/disconnect', {
      params: { path: { relationshipId: input.relationshipId } },
      body: { expectedRevision: input.expectedRevision, reason: input.reason },
    }),
  ).finally(resetPartnerCache);
}

/** `buyerOrganizationId: null` = invite a new buyer business; an id = reconnect that (formerly connected) buyer. */
export function inviteBuyer(input: { recipientEmail: string; buyerOrganizationId: string | null }): Promise<Invitation> {
  return data(api.POST('/invitations/buyers', { body: input }));
}

export async function revokeBuyerInvitation(invitationId: string): Promise<void> {
  await data(api.DELETE('/invitations/{invitationId}', { params: { path: { invitationId } } }));
}

/** Keep `idempotencyKey` with the pending intent; reuse it only to retry after an uncertain outcome. */
export function resendBuyerInvitation(input: { invitationId: string; expectedRevision: string; idempotencyKey: string }): Promise<Invitation> {
  return data(
    api.POST('/invitations/{invitationId}/resends', {
      params: { path: { invitationId: input.invitationId }, header: { 'Idempotency-Key': input.idempotencyKey } },
      body: { expectedRevision: input.expectedRevision },
    }),
  );
}

export function confirmRelationshipAgreedPrices(input: { relationshipId: string } & AgreedPriceConfirmation): Promise<Relationship> {
  const { relationshipId, ...body } = input;
  return data(api.POST('/relationships/{relationshipId}/agreed-prices/confirmation', { params: { path: { relationshipId } }, body }));
}
