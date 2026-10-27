import { api, data, download } from '../api/client';
import type {
  Account,
  Address,
  BusinessContact,
  Contact,
  Country,
  Invitation,
  Location,
  Organization,
  OrganizationUpdate,
  OwnershipTransfer,
  PortableExport,
  PrivacyCase,
  Role,
} from '../api/models';
import type { QueryOf } from '../api/models';

/*
 * The caller's own organization: settings, members and member invitations, ownership transfer,
 * saved locations (vendor fulfilment and buyer delivery locations are the same resource),
 * business contacts, the safe audit log and assisted privacy cases. React-free.
 */

// ── Roles (fixed OWNER / ADMIN / STAFF; the backend enforces every rule) ──

export function canManageOrganization(role: Role | null | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/** Owners invite admins and staff; admins invite staff. */
export function invitableRoles(role: Role | null | undefined): ('ADMIN' | 'STAFF')[] {
  if (role === 'OWNER') return ['ADMIN', 'STAFF'];
  if (role === 'ADMIN') return ['STAFF'];
  return [];
}

/** Revoke/resend a member invitation: owner for any role, admin for staff invitations. */
export function canManageInvitation(actor: Role | null | undefined, invitedRole: 'ADMIN' | 'STAFF' | null): boolean {
  if (actor === 'OWNER') return true;
  return actor === 'ADMIN' && invitedRole !== 'ADMIN';
}

export interface MemberActions {
  changeRole: boolean;
  deactivate: boolean;
  reactivate: boolean;
  transferOwnership: boolean;
}

/**
 * Which member controls to show (FRONTEND_HANDOFF "Organization members"): only the owner
 * changes roles; owner deactivates non-owners, admin deactivates staff; owner reactivates former
 * admins, owner/admin reactivate former staff; the owner may offer ownership to another active
 * member. Self-service deactivation lives on the account page (staff only).
 */
export function memberActions(actor: Account, target: Account): MemberActions {
  const self = actor.id === target.id;
  const owner = actor.role === 'OWNER';
  const admin = actor.role === 'ADMIN';
  const active = target.state === 'ACTIVE';
  const targetOwner = target.role === 'OWNER';
  return {
    changeRole: owner && !self && active && !targetOwner,
    deactivate: !self && active && !targetOwner && (owner || (admin && target.role === 'STAFF')),
    reactivate: target.state === 'DEACTIVATED' && (owner || (admin && target.role === 'STAFF')),
    transferOwnership: owner && !self && active && !targetOwner,
  };
}

// ── Addresses, contacts, locations ───────────────────────────────────────

export function emptyAddress(country: Country): Address {
  return { line1: '', line2: null, city: '', postalCode: '', country, latitude: null, longitude: null };
}

/** "Street 1, 11000 City" for lists. */
export function formatAddress(address: Address): string {
  return [address.line1, address.line2, `${address.postalCode} ${address.city}`.trim()].filter(Boolean).join(', ');
}

/** Trimmed text or null (explicit null clears an optional member). */
export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export type DraftProblem = 'required' | 'tooLong' | 'invalid';

/** Mirrors the contract's text bounds so problems sit on the fields before a save. */
export function textProblem(value: string, { required = true, max = 100 }: { required?: boolean; max?: number } = {}): DraftProblem | null {
  const length = [...value.trim()].length;
  if (required && length === 0) return 'required';
  if (length > max) return 'tooLong';
  return null;
}

/** Contract phone grammar: 3–30 characters of digits, spaces and + ( ) -. */
export function phoneProblem(value: string, required: boolean): DraftProblem | null {
  const trimmed = value.trim();
  if (!trimmed) return required ? 'required' : null;
  return /^[+0-9 ()-]{3,30}$/.test(trimmed) ? null : 'invalid';
}

export function emailProblem(value: string, required: boolean): DraftProblem | null {
  const trimmed = value.trim();
  if (!trimmed) return required ? 'required' : null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254 ? null : 'invalid';
}

export function addressProblems(address: Address): Partial<Record<'line1' | 'city' | 'postalCode', DraftProblem>> {
  const out: Partial<Record<'line1' | 'city' | 'postalCode', DraftProblem>> = {};
  const line1 = textProblem(address.line1, { max: 200 });
  const city = textProblem(address.city);
  const postal = textProblem(address.postalCode, { max: 20 });
  if (line1) out.line1 = line1;
  if (city) out.city = city;
  if (postal) out.postalCode = postal;
  return out;
}

/** Normalizes an address draft for the wire: trimmed text, explicit nulls. */
export function cleanAddress(address: Address): Address {
  return {
    line1: address.line1.trim(),
    line2: address.line2 === null ? null : textOrNull(address.line2),
    city: address.city.trim(),
    postalCode: address.postalCode.trim(),
    country: address.country,
    latitude: address.latitude,
    longitude: address.longitude,
  };
}

export interface ContactDraft {
  name: string;
  phone: string;
  email: string;
}

export const emptyContactDraft = (): ContactDraft => ({ name: '', phone: '', email: '' });

export function contactDraftFrom(contact: Contact | null): ContactDraft {
  return contact ? { name: contact.name, phone: contact.phone, email: contact.email ?? '' } : emptyContactDraft();
}

/** All three blank means "no contact" (allowed for vendor locations only). */
export function isContactDraftBlank(draft: ContactDraft): boolean {
  return !draft.name.trim() && !draft.phone.trim() && !draft.email.trim();
}

export function contactProblems(draft: ContactDraft): Partial<Record<keyof ContactDraft, DraftProblem>> {
  const out: Partial<Record<keyof ContactDraft, DraftProblem>> = {};
  const name = textProblem(draft.name);
  const phone = phoneProblem(draft.phone, true);
  const email = emailProblem(draft.email, false);
  if (name) out.name = name;
  if (phone) out.phone = phone;
  if (email) out.email = email;
  return out;
}

export function contactFromDraft(draft: ContactDraft): Contact {
  return { name: draft.name.trim(), phone: draft.phone.trim(), email: textOrNull(draft.email) };
}

/** The full OrganizationUpdate (every member required) from the current organization plus edits. */
export function organizationUpdate(org: Organization, patch: Partial<Omit<OrganizationUpdate, 'expectedRevision'>> = {}): OrganizationUpdate {
  return {
    expectedRevision: org.revision,
    displayName: org.displayName,
    legalName: org.legalName,
    registeredAddress: org.registeredAddress,
    defaultLanguage: org.defaultLanguage,
    // Vendors must always send false.
    staffSubmissionRestricted: org.type === 'VENDOR' ? false : org.staffSubmissionRestricted,
    partnerContactId: org.partnerContactId,
    ...patch,
  };
}

// ── Keys and queries ──────────────────────────────────────────────────────

export type MemberQuery = QueryOf<'listMembers'>;
export type InvitationQuery = QueryOf<'listInvitations'>;
export type LocationQuery = QueryOf<'listLocations'>;
export type ContactQuery = QueryOf<'listContacts'>;

export const organizationKeys = {
  all: ['organization'] as const,
  current: () => ['organization', 'current'] as const,
  members: (q: MemberQuery = {}) => ['organization', 'members', q] as const,
  invitations: (q: InvitationQuery = {}) => ['organization', 'invitations', q] as const,
  /** Other areas reading saved locations may reuse this prefix to see edits immediately. */
  locations: (q: LocationQuery = {}) => ['organization', 'locations', q] as const,
  contacts: (q: ContactQuery = {}) => ['organization', 'contacts', q] as const,
  transfer: (transferId: string) => ['organization', 'transfer', transferId] as const,
  latestTransfer: () => ['organization', 'latestTransfer'] as const,
  audit: (action: string | null) => ['organization', 'audit', action] as const,
  privacyCases: () => ['organization', 'privacyCases'] as const,
  privacyExport: (caseId: string) => ['organization', 'privacyExport', caseId] as const,
};

export const organizationQueries = {
  current: () => ({ queryKey: organizationKeys.current(), queryFn: () => data(api.GET('/organization')) }),
  members: (q: MemberQuery = {}) => ({
    queryKey: organizationKeys.members(q),
    queryFn: () => data(api.GET('/organization/members', { params: { query: q } })),
  }),
  /** Owner/admin only (staff get 403). Vendors also see buyer invitations; screens filter by purpose. */
  invitations: (q: InvitationQuery = {}) => ({
    queryKey: organizationKeys.invitations(q),
    queryFn: () => data(api.GET('/invitations', { params: { query: q } })),
  }),
  locations: (q: LocationQuery = {}) => ({
    queryKey: organizationKeys.locations(q),
    queryFn: () => data(api.GET('/organization/locations', { params: { query: q } })),
  }),
  contacts: (q: ContactQuery = {}) => ({
    queryKey: organizationKeys.contacts(q),
    queryFn: () => data(api.GET('/organization/contacts', { params: { query: q } })),
  }),
  transfer: (transferId: string) => ({
    queryKey: organizationKeys.transfer(transferId),
    queryFn: () => data(api.GET('/organization/ownership-transfers/{transferId}', { params: { path: { transferId } } })),
  }),
  /**
   * There is no transfer list endpoint. Owners/admins find the newest request through the audit
   * log (TRANSFER_REQUESTED carries the transfer id) and read it; 404 means it isn't theirs to see.
   */
  latestTransfer: () => ({
    queryKey: organizationKeys.latestTransfer(),
    queryFn: async (): Promise<OwnershipTransfer | null> => {
      const page = await data(api.GET('/organization/audit', { params: { query: { action: 'TRANSFER_REQUESTED', size: 1 } } }));
      const transferId = page.items[0]?.resourceId;
      if (!transferId) return null;
      try {
        return await data(api.GET('/organization/ownership-transfers/{transferId}', { params: { path: { transferId } } }));
      } catch (error) {
        if ((error as { status?: number }).status === 404) return null;
        throw error;
      }
    },
  }),
  /** Cursor list; use with useInfiniteQuery (initialPageParam: null). Owner/admin only. */
  audit: (action: string | null) => ({
    queryKey: organizationKeys.audit(action),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      data(
        api.GET('/organization/audit', {
          params: { query: { size: 50, ...(action ? { action } : {}), ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor,
  }),
  /**
   * Privacy cases have no list endpoint either; PRIVACY_CASE_REQUESTED audit rows carry the case
   * id, so the newest cases are read from there (owner/admin, the same people who may request).
   */
  privacyCases: () => ({
    queryKey: organizationKeys.privacyCases(),
    queryFn: async (): Promise<PrivacyCase[]> => {
      const page = await data(api.GET('/organization/audit', { params: { query: { action: 'PRIVACY_CASE_REQUESTED', size: 20 } } }));
      const ids = [...new Set(page.items.map((e) => e.resourceId).filter((id): id is string => !!id))];
      const cases = await Promise.all(
        ids.map((caseId) =>
          data(api.GET('/organization/privacy-cases/{caseId}', { params: { path: { caseId } } })).catch((error: { status?: number }) => {
            if (error.status === 404 || error.status === 403) return null;
            throw error;
          }),
        ),
      );
      return cases.filter((c): c is PrivacyCase => c !== null);
    },
  }),
  /** Latest portable export of an EXPORT case (original requester, fresh authentication). */
  privacyExport: (caseId: string) => ({
    queryKey: organizationKeys.privacyExport(caseId),
    queryFn: () => data(api.GET('/organization/privacy-cases/{caseId}/export', { params: { path: { caseId } } })),
  }),
};

/** Follows every page of an offset list (≤100 per page) — for pickers over small collections. */
export async function allPages<T>(fetchPage: (page: number) => Promise<{ items: T[]; page: number; size: number }>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 100; page++) {
    const result = await fetchPage(page);
    out.push(...result.items);
    if (result.items.length < result.size) break;
  }
  return out;
}

export const allActiveLocations = () => ({
  queryKey: organizationKeys.locations({ state: 'ACTIVE', size: 100 }),
  queryFn: () =>
    allPages((page) => data(api.GET('/organization/locations', { params: { query: { state: 'ACTIVE', size: 100, page } } }))).then((items) => ({
      items,
      page: 0,
      size: items.length,
      total: items.length,
    })),
});

// ── Organization ──────────────────────────────────────────────────────────

export function updateOrganization(body: OrganizationUpdate): Promise<Organization> {
  return data(api.PUT('/organization', { body }));
}

/** Owner only, guarded. Irreversible; revokes this session on success. */
export function closeOrganization(expectedRevision: string, reason: string): Promise<Organization> {
  return data(api.POST('/organization/closure', { body: { expectedRevision, reason } }));
}

// ── Members ───────────────────────────────────────────────────────────────

export function changeMemberRole(accountId: string, expectedRevision: string, role: 'ADMIN' | 'STAFF'): Promise<Account> {
  return data(api.PUT('/organization/members/{accountId}/role', { params: { path: { accountId } }, body: { expectedRevision, role } }));
}

export function deactivateMember(accountId: string, expectedRevision: string): Promise<Account> {
  return data(api.POST('/organization/members/{accountId}/deactivation', { params: { path: { accountId } }, body: { expectedRevision } }));
}

/** Reactivated members always return as STAFF. */
export function reactivateMember(accountId: string, expectedRevision: string): Promise<Account> {
  return data(api.POST('/organization/members/{accountId}/reactivation', { params: { path: { accountId } }, body: { expectedRevision } }));
}

// ── Member invitations ────────────────────────────────────────────────────

export function inviteMember(recipientEmail: string, role: 'ADMIN' | 'STAFF'): Promise<Invitation> {
  return data(api.POST('/invitations/members', { body: { recipientEmail, role } }));
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await data(api.DELETE('/invitations/{invitationId}', { params: { path: { invitationId } } }));
}

/** UUIDv4 key kept with the intent; reuse it only to retry the same resend after an uncertain outcome. */
export function resendInvitation(invitationId: string, expectedRevision: string, idempotencyKey: string): Promise<Invitation> {
  return data(
    api.POST('/invitations/{invitationId}/resends', {
      params: { path: { invitationId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { expectedRevision },
    }),
  );
}

// ── Ownership transfer ────────────────────────────────────────────────────

/** Guarded. expectedRevision is the current organization revision (natural retry identity). */
export function requestOwnershipTransfer(recipientAccountId: string, expectedRevision: string): Promise<OwnershipTransfer> {
  return data(api.POST('/organization/ownership-transfers', { body: { recipientAccountId, expectedRevision } }));
}

export async function revokeOwnershipTransfer(transferId: string, expectedRevision: string): Promise<void> {
  await data(api.DELETE('/organization/ownership-transfers/{transferId}', { params: { path: { transferId }, query: { expectedRevision } } }));
}

/** Guarded, recipient only. Both participants are signed out on success. */
export function acceptOwnershipTransfer(transferId: string, expectedRevision: string): Promise<OwnershipTransfer> {
  return data(
    api.POST('/organization/ownership-transfers/{transferId}/acceptance', { params: { path: { transferId } }, body: { expectedRevision } }),
  );
}

// ── Locations ─────────────────────────────────────────────────────────────

export interface LocationFields {
  name: string;
  address: Address;
  contact: Contact | null;
  instructions: string | null;
}

/** `id` is a UUIDv7 generated once per create intent and reused on retries of the same payload. */
export function createLocation(id: string, fields: LocationFields): Promise<Location> {
  return data(api.POST('/organization/locations', { body: { id, ...fields } }));
}

export function updateLocation(location: Location, fields: LocationFields): Promise<Location> {
  return data(
    api.PUT('/organization/locations/{resourceId}', {
      params: { path: { resourceId: location.id } },
      body: { expectedRevision: location.revision, ...fields },
    }),
  );
}

export function archiveLocation(location: Location): Promise<Location> {
  return data(
    api.POST('/organization/locations/{resourceId}/archive', { params: { path: { resourceId: location.id } }, body: { expectedRevision: location.revision } }),
  );
}

export function restoreLocation(location: Location): Promise<Location> {
  return data(
    api.POST('/organization/locations/{resourceId}/restore', { params: { path: { resourceId: location.id } }, body: { expectedRevision: location.revision } }),
  );
}

// ── Business contacts ─────────────────────────────────────────────────────

export function createContact(id: string, label: string, contact: Contact): Promise<BusinessContact> {
  return data(api.POST('/organization/contacts', { body: { id, label, contact } }));
}

export function updateContact(existing: BusinessContact, label: string, contact: Contact): Promise<BusinessContact> {
  return data(
    api.PUT('/organization/contacts/{resourceId}', {
      params: { path: { resourceId: existing.id } },
      body: { expectedRevision: existing.revision, label, contact },
    }),
  );
}

export function archiveContact(existing: BusinessContact): Promise<BusinessContact> {
  return data(
    api.POST('/organization/contacts/{resourceId}/archive', { params: { path: { resourceId: existing.id } }, body: { expectedRevision: existing.revision } }),
  );
}

export function restoreContact(existing: BusinessContact): Promise<BusinessContact> {
  return data(
    api.POST('/organization/contacts/{resourceId}/restore', { params: { path: { resourceId: existing.id } }, body: { expectedRevision: existing.revision } }),
  );
}

// ── Privacy cases ─────────────────────────────────────────────────────────

/** Assisted intake only (nothing is exported or redacted by this call). `id` is a UUIDv7 per intent. */
export function requestPrivacyCase(id: string, kind: 'EXPORT' | 'REDACTION', reason: string): Promise<PrivacyCase> {
  return data(api.POST('/organization/privacy-cases', { body: { id, kind, reason } }));
}

/** The portable JSON document (guarded: fresh authentication). The first download completes the case. */
export function downloadPortableExport(exportRecord: PortableExport): Promise<Response> {
  return download(`/organization/privacy-cases/${exportRecord.caseId}/exports/${exportRecord.id}/content`);
}

// ── Audit labels ──────────────────────────────────────────────────────────

/** Business audit actions the backend projects (BE JdbcAuditReads), for the filter menu. */
export const AUDIT_ACTIONS = [
  'ORGANIZATION_UPDATED',
  'LOCATION_CREATED',
  'LOCATION_UPDATED',
  'LOCATION_ARCHIVED',
  'LOCATION_RESTORED',
  'CONTACT_CREATED',
  'CONTACT_UPDATED',
  'CONTACT_ARCHIVED',
  'CONTACT_RESTORED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_DEACTIVATED',
  'MEMBER_REACTIVATED',
  'TRANSFER_REQUESTED',
  'TRANSFER_ACCEPTED',
  'TRANSFER_REVOKED',
  'TRANSFER_EXPIRED',
  'TRANSFER_INVALIDATED',
  'TRADING_CONNECTED',
  'TRADING_ADMIN_CONNECTED',
  'TRADING_RECONNECTED',
  'TRADING_DISCONNECTED',
  'PLAN_REQUESTED',
  'PLAN_WITHDRAWN',
  'PLAN_APPROVED',
  'PLAN_REJECTED',
  'PLAN_ASSIGNED',
  'PLAN_SUPERSEDED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_ACTIVATED',
  'PRODUCT_DEACTIVATED',
  'PRODUCT_ARCHIVED',
  'PRODUCT_RESTORED',
  'PRICING_UPDATED',
  'AGREED_PRICE_SAVED',
  'AGREED_PRICE_REMOVED',
  'AGREED_PRICE_CONFIRMED',
  'AGREED_PRICES_REVIEWED',
  'PROMOTION_CREATED',
  'PROMOTION_UPDATED',
  'PROMOTION_STOPPED',
  'PROMOTION_ARCHIVED',
  'TAXONOMY_CREATED',
  'TAXONOMY_RENAMED',
  'TAXONOMY_DELETED',
  'TRACKING_ENABLED',
  'TRACKING_DISABLED',
  'RECONCILIATION_PREPARED',
  'RECONCILIATION_ACKNOWLEDGED',
  'RECONCILIATION_APPLIED',
  'STOCK_INITIALIZED',
  'STOCK_SET',
  'STOCK_ADJUSTED',
  'STOCK_CONFIRMED',
  'UPLOAD_RESERVED',
  'UPLOAD_QUARANTINED',
  'IMPORT_PREVIEWED',
  'IMPORT_CONFIRMED',
  'EXPORT_CREATED',
  'EXPORT_DOWNLOADED',
  'ORDER_SUBMITTED',
  'ORDER_ACCEPTED',
  'ORDER_REJECTED',
  'ORDER_CANCELLED',
  'ORDER_STAGE_CHANGED',
  'ORDER_DISPATCHED',
  'ORDER_DELIVERED',
  'CANCELLATION_REQUESTED',
  'CANCELLATION_APPROVED',
  'CANCELLATION_REJECTED',
  'CANCELLATION_WITHDRAWN',
  'CANCELLATION_RESOLVED',
  'MESSAGE_CREATED',
  'STAGE_CREATED',
  'STAGE_RENAMED',
  'STAGE_RETIRED',
  'STAGES_REORDERED',
  'PRIVACY_CASE_REQUESTED',
  'PRIVACY_EXPORT_DOWNLOADED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isKnownAuditAction(action: string): action is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(action);
}
