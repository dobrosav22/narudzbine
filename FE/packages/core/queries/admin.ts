import { api, data } from '../api';
import type {
  Address,
  AdminOrganizationUpdate,
  Country,
  DirectConnection,
  Invitation,
  Organization,
  PlanAssignment,
  PlanRevision,
  QueryOf,
  ReasonCommand,
  RecoveryRequest,
  RecoveryReview,
  SetupInvitationRequest,
  SupportAccessRequest,
  VendorPlan,
} from '../api';
import { COUNTRY_TIME_ZONE, addDays } from '../format';

/*
 * Platform administration (web console only). Named platform administrators read operational
 * metadata across both countries and perform reasoned, audited corrections. They never write
 * commercial data, never impersonate, and read commercial records only through a
 * reason-scoped, 30-minute support context (X-Support-Access-Id). No admin exports exist.
 */

export type AdminOrganizationQuery = QueryOf<'adminListOrganizations'>;
export type AdminMemberQuery = QueryOf<'adminListMembers'>;
export type AdminPlanRequestQuery = QueryOf<'adminListPlanRequests'>;
export type AdminAuditQuery = Omit<QueryOf<'adminListAudit'>, 'cursor'>;
export type AdminReportQuery = QueryOf<'adminReadReport'>;
export type AdminPagedQuery = { page?: number; size?: number; includeTotal?: boolean };

export const ORGANIZATION_STATES = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const satisfies readonly Organization['state'][];
export const PLAN_REQUEST_STATES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED'] as const;
export const ADMIN_COUNTRIES = ['RS', 'BA'] as const satisfies readonly Country[];
/** Support contexts last exactly 30 minutes from creation (BE/SUPPORT_IMPLEMENTATION.md). */
export const SUPPORT_CONTEXT_MINUTES = 30;

export const adminKeys = {
  all: ['admin'] as const,
  summary: () => ['admin', 'summary'] as const,
  organizations: (q: AdminOrganizationQuery) => ['admin', 'organizations', q] as const,
  organization: (id: string) => ['admin', 'organization', id] as const,
  members: (id: string, q: AdminMemberQuery) => ['admin', 'organization', id, 'members', q] as const,
  vendorPlan: (vendorId: string) => ['admin', 'organization', vendorId, 'plan'] as const,
  plans: () => ['admin', 'plans'] as const,
  planRequests: (q: AdminPlanRequestQuery) => ['admin', 'planRequests', q] as const,
  audit: (q: AdminAuditQuery) => ['admin', 'audit', q] as const,
  invitation: (id: string) => ['admin', 'invitation', id] as const,
  recoveryCase: (id: string) => ['admin', 'recoveryCase', id] as const,
  privacyCase: (id: string) => ['admin', 'privacyCase', id] as const,
  /** Everything read under one support context; each successful read is audited server-side. */
  support: (accessId: string) => ['admin', 'support', accessId] as const,
};

/** Header binding every support read to its reason-scoped context. */
const supportHeader = (accessId: string) => ({ 'X-Support-Access-Id': accessId });

export const adminQueries = {
  summary: () => ({ queryKey: adminKeys.summary(), queryFn: () => data(api.GET('/admin/summary')) }),
  organizations: (q: AdminOrganizationQuery) => ({
    queryKey: adminKeys.organizations(q),
    queryFn: () => data(api.GET('/admin/organizations', { params: { query: q } })),
  }),
  organization: (id: string) => ({
    queryKey: adminKeys.organization(id),
    queryFn: () => data(api.GET('/admin/organizations/{organizationId}', { params: { path: { organizationId: id } } })),
  }),
  members: (id: string, q: AdminMemberQuery) => ({
    queryKey: adminKeys.members(id, q),
    queryFn: () => data(api.GET('/admin/organizations/{organizationId}/members', { params: { path: { organizationId: id }, query: q } })),
  }),
  vendorPlan: (vendorId: string) => ({
    queryKey: adminKeys.vendorPlan(vendorId),
    queryFn: () => data(api.GET('/admin/vendors/{vendorId}/plan', { params: { path: { vendorId } } })),
  }),
  /** Every plan revision including retired ones (current assignments may pin a retired revision). */
  plans: () => ({
    queryKey: adminKeys.plans(),
    queryFn: async () => (await data(api.GET('/plans', { params: { query: { includeRetired: true, size: 100 } } }))).items,
    staleTime: 5 * 60_000,
  }),
  planRequests: (q: AdminPlanRequestQuery) => ({
    queryKey: adminKeys.planRequests(q),
    queryFn: () => data(api.GET('/admin/plan-requests', { params: { query: q } })),
  }),
  /** Cursor list: use with useInfiniteQuery (initialPageParam null, next = nextCursor). */
  audit: (q: AdminAuditQuery) => ({
    queryKey: adminKeys.audit(q),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      data(api.GET('/admin/audit', { params: { query: { ...q, ...(pageParam ? { cursor: pageParam } : {}) } } })),
  }),
  invitation: (id: string) => ({
    queryKey: adminKeys.invitation(id),
    queryFn: () => data(api.GET('/invitations/{invitationId}', { params: { path: { invitationId: id } } })),
  }),
  recoveryCase: (id: string) => ({
    queryKey: adminKeys.recoveryCase(id),
    queryFn: () => data(api.GET('/admin/recovery-cases/{caseId}', { params: { path: { caseId: id } } })),
  }),
  privacyCase: (id: string) => ({
    queryKey: adminKeys.privacyCase(id),
    queryFn: () => data(api.GET('/admin/privacy-cases/{caseId}', { params: { path: { caseId: id } } })),
  }),
};

/**
 * Support reads. Every successful call commits private audit evidence, so these are never
 * refetched in the background: no focus refetch, no automatic retry, cached until the context
 * ends (see SUPPORT_QUERY_OPTIONS).
 */
export const adminSupportQueries = {
  report: (accessId: string, organizationId: string, q: AdminReportQuery) => ({
    queryKey: [...adminKeys.support(accessId), 'report', organizationId, q] as const,
    queryFn: () =>
      data(
        api.GET('/admin/support/organizations/{organizationId}/reports', {
          params: { path: { organizationId }, query: q, header: supportHeader(accessId) },
        }),
      ),
  }),
  products: (accessId: string, organizationId: string, q: AdminPagedQuery) => ({
    queryKey: [...adminKeys.support(accessId), 'products', organizationId, q] as const,
    queryFn: () =>
      data(
        api.GET('/admin/support/organizations/{organizationId}/products', {
          params: { path: { organizationId }, query: q, header: supportHeader(accessId) },
        }),
      ),
  }),
  pricing: (accessId: string, productId: string) => ({
    queryKey: [...adminKeys.support(accessId), 'pricing', productId] as const,
    queryFn: () =>
      data(api.GET('/admin/support/products/{productId}/pricing', { params: { path: { productId }, header: supportHeader(accessId) } })),
  }),
  stock: (accessId: string, productId: string) => ({
    queryKey: [...adminKeys.support(accessId), 'stock', productId] as const,
    queryFn: () =>
      data(api.GET('/admin/support/products/{productId}/stock', { params: { path: { productId }, header: supportHeader(accessId) } })),
  }),
  promotions: (accessId: string, organizationId: string, q: AdminPagedQuery) => ({
    queryKey: [...adminKeys.support(accessId), 'promotions', organizationId, q] as const,
    queryFn: () =>
      data(
        api.GET('/admin/support/organizations/{organizationId}/promotions', {
          params: { path: { organizationId }, query: q, header: supportHeader(accessId) },
        }),
      ),
  }),
  agreedPrices: (accessId: string, organizationId: string, q: AdminPagedQuery) => ({
    queryKey: [...adminKeys.support(accessId), 'agreedPrices', organizationId, q] as const,
    queryFn: () =>
      data(
        api.GET('/admin/support/organizations/{organizationId}/agreed-prices', {
          params: { path: { organizationId }, query: q, header: supportHeader(accessId) },
        }),
      ),
  }),
  order: (accessId: string, orderId: string) => ({
    queryKey: [...adminKeys.support(accessId), 'order', orderId] as const,
    queryFn: () => data(api.GET('/admin/support/orders/{orderId}', { params: { path: { orderId }, header: supportHeader(accessId) } })),
  }),
  /** Cursor list (useInfiniteQuery); cursors are bound to the context and expire with it. */
  messages: (accessId: string, orderId: string) => ({
    queryKey: [...adminKeys.support(accessId), 'messages', orderId] as const,
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      data(
        api.GET('/admin/support/orders/{orderId}/messages', {
          params: { path: { orderId }, query: { size: 50, ...(pageParam ? { cursor: pageParam } : {}) }, header: supportHeader(accessId) },
        }),
      ),
  }),
};

export const SUPPORT_QUERY_OPTIONS = {
  staleTime: Infinity,
  gcTime: SUPPORT_CONTEXT_MINUTES * 60_000,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

// ---- Mutations (all reasons are private platform audit context unless noted) ----

export function adminCorrectOrganization(input: { organizationId: string; body: AdminOrganizationUpdate }) {
  return data(api.PUT('/admin/organizations/{organizationId}', { params: { path: { organizationId: input.organizationId } }, body: input.body }));
}

export type OrganizationLifecycleAction = 'suspend' | 'reactivate' | 'close';

/** Suspend/reactivate/close with the current organization revision and a private reason. */
export function adminChangeOrganizationState(input: { organizationId: string; action: OrganizationLifecycleAction; body: ReasonCommand }) {
  const params = { path: { organizationId: input.organizationId } };
  switch (input.action) {
    case 'suspend':
      return data(api.POST('/admin/organizations/{organizationId}/suspend', { params, body: input.body }));
    case 'reactivate':
      return data(api.POST('/admin/organizations/{organizationId}/reactivate', { params, body: input.body }));
    case 'close':
      return data(api.POST('/admin/organizations/{organizationId}/close', { params, body: input.body }));
  }
}

/** Staff-only lifecycle (owners/admins cannot be changed here). Body uses the Account revision. */
export function adminSetStaffActive(input: { organizationId: string; accountId: string; active: boolean; body: ReasonCommand }) {
  const params = { path: { organizationId: input.organizationId, accountId: input.accountId } };
  return input.active
    ? data(api.POST('/admin/organizations/{organizationId}/members/{accountId}/reactivation', { params, body: input.body }))
    : data(api.POST('/admin/organizations/{organizationId}/members/{accountId}/deactivation', { params, body: input.body }));
}

export function adminAssignPlan(input: { vendorId: string; body: PlanAssignment }) {
  return data(api.PUT('/admin/vendors/{vendorId}/plan', { params: { path: { vendorId: input.vendorId } }, body: input.body }));
}

/** Approval/rejection reasons are shown to the vendor: business-safe text only. */
export function adminResolvePlanRequest(input: { requestId: string; approve: boolean; body: ReasonCommand }) {
  const params = { path: { requestId: input.requestId } };
  return input.approve
    ? data(api.POST('/admin/plan-requests/{requestId}/approval', { params, body: input.body }))
    : data(api.POST('/admin/plan-requests/{requestId}/rejection', { params, body: input.body }));
}

export function adminConnect(body: DirectConnection) {
  return data(api.POST('/admin/connections', { body }));
}

export function adminDisconnect(input: { relationshipId: string; body: ReasonCommand }) {
  return data(api.POST('/admin/relationships/{relationshipId}/disconnect', { params: { path: { relationshipId: input.relationshipId } }, body: input.body }));
}

/**
 * Creates (201) or returns the identical still-pending invitation (200, no new email and no
 * expiry change). `duplicate` tells the two apart for the operator.
 */
export async function adminInviteOrganization(body: SetupInvitationRequest): Promise<{ invitation: Invitation; duplicate: boolean }> {
  const result = await api.POST('/admin/setup-invitations', { body });
  return { invitation: result.data as Invitation, duplicate: result.response.status === 200 };
}

/** Only the original sending administrator may resend; key = UUIDv4 kept with the pending intent. */
export function adminResendInvitation(input: { invitationId: string; expectedRevision: string; idempotencyKey: string }) {
  return data(
    api.POST('/invitations/{invitationId}/resends', {
      params: { path: { invitationId: input.invitationId }, header: { 'Idempotency-Key': input.idempotencyKey } },
      body: { expectedRevision: input.expectedRevision },
    }),
  );
}

export async function adminRevokeInvitation(invitationId: string): Promise<void> {
  await data(api.DELETE('/invitations/{invitationId}', { params: { path: { invitationId } } }));
}

export function adminCreateSupportAccess(body: SupportAccessRequest) {
  return data(api.POST('/admin/support-access', { body }));
}

export function adminCreateRecoveryCase(body: RecoveryRequest) {
  return data(api.POST('/admin/recovery-cases', { body }));
}

export function adminReviewRecoveryCase(input: { caseId: string; body: RecoveryReview }) {
  return data(api.POST('/admin/recovery-cases/{caseId}/review', { params: { path: { caseId: input.caseId } }, body: input.body }));
}

// ---- Pure helpers ----

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Resource ids are lowercase UUIDv7; check pasted ids before calling (avoids a 422 round trip). */
export function normalizeResourceId(input: string): string | null {
  const value = input.trim().toLowerCase();
  return ID_PATTERN.test(value) ? value : null;
}

/** RecoveryRequest/RecoveryReview evidenceReference grammar (opaque operator-system reference). */
export function isEvidenceReference(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value);
}

/** Text fields with a 1..max code-point limit (reason 1000, case reference 100, ...). */
export function isFilledWithin(value: string, max: number): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && [...trimmed].length <= max;
}

export type PlanLimit = 'products' | 'buyers';

/** Which limits of `plan` the vendor's current counted usage would exceed (empty = it fits). */
export function planOverages(plan: Pick<PlanRevision, 'productLimit' | 'activeBuyerLimit'>, usage: Pick<VendorPlan, 'nonArchivedProductCount' | 'activeBuyerCount'>): PlanLimit[] {
  const out: PlanLimit[] = [];
  if (usage.nonArchivedProductCount > plan.productLimit) out.push('products');
  if (usage.activeBuyerCount > plan.activeBuyerLimit) out.push('buyers');
  return out;
}

/** Plans ordered small → large; retired revisions after current ones. */
export function sortPlans(plans: PlanRevision[]): PlanRevision[] {
  return [...plans].sort((a, b) => Number(a.retired) - Number(b.retired) || a.productLimit - b.productLimit || a.revision - b.revision);
}

/** Today's calendar date (`YYYY-MM-DD`) in a target country's zone, independent of the viewer. */
export function countryToday(country: Country, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COUNTRY_TIME_ZONE[country], year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Default support report window: the last 30 country-local days, daily buckets. */
export function defaultSupportReportQuery(country: Country, now: Date = new Date()): AdminReportQuery {
  const to = countryToday(country, now);
  return { from: addDays(to, -29), to, grouping: 'DAY' };
}

/** Milliseconds left on a support context (0 once expired). */
export function supportTimeLeft(expiresAt: string, now: number = Date.now()): number {
  return Math.max(0, Date.parse(expiresAt) - now);
}

export interface OrganizationCorrectionForm {
  displayName: string;
  legalName: string;
  registrationIdentifier: string;
  taxIdentifier: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  reason: string;
}

export function organizationCorrectionForm(org: Organization): OrganizationCorrectionForm {
  return {
    displayName: org.displayName,
    legalName: org.legalName,
    registrationIdentifier: org.registrationIdentifier,
    taxIdentifier: org.taxIdentifier ?? '',
    line1: org.registeredAddress.line1,
    line2: org.registeredAddress.line2 ?? '',
    city: org.registeredAddress.city,
    postalCode: org.registeredAddress.postalCode,
    reason: '',
  };
}

/**
 * The complete replacement body for adminCorrectOrganization. Country, coordinates, type,
 * currency and owner are not editable: the address country and coordinates are carried over.
 * Blank optional text becomes explicit null (the contract's "clear").
 */
export function organizationCorrectionBody(org: Organization, form: OrganizationCorrectionForm, expectedRevision: string): AdminOrganizationUpdate {
  const optional = (v: string) => (v.trim() === '' ? null : v.trim());
  const registeredAddress: Address = {
    line1: form.line1.trim(),
    line2: optional(form.line2),
    city: form.city.trim(),
    postalCode: form.postalCode.trim(),
    country: org.country,
    latitude: org.registeredAddress.latitude,
    longitude: org.registeredAddress.longitude,
  };
  return {
    expectedRevision,
    displayName: form.displayName.trim(),
    legalName: form.legalName.trim(),
    registrationIdentifier: form.registrationIdentifier.trim(),
    taxIdentifier: optional(form.taxIdentifier),
    registeredAddress,
    reason: form.reason.trim(),
  };
}

/** True when the form would change nothing but the reason (the backend treats it as a no-op). */
export function correctionUnchanged(org: Organization, form: OrganizationCorrectionForm): boolean {
  const body = organizationCorrectionBody(org, form, org.revision);
  return (
    body.displayName === org.displayName &&
    body.legalName === org.legalName &&
    body.registrationIdentifier === org.registrationIdentifier &&
    body.taxIdentifier === org.taxIdentifier &&
    body.registeredAddress.line1 === org.registeredAddress.line1 &&
    body.registeredAddress.line2 === org.registeredAddress.line2 &&
    body.registeredAddress.city === org.registeredAddress.city &&
    body.registeredAddress.postalCode === org.registeredAddress.postalCode
  );
}

/** Where an audit row's resourceId can be opened in the console, by action family. */
export function auditResourceKind(action: string): 'recoveryCase' | 'privacyCase' | 'invitation' | 'organization' | null {
  if (action.startsWith('RECOVERY_')) return 'recoveryCase';
  if (action.startsWith('PRIVACY_CASE')) return 'privacyCase';
  if (action.startsWith('SETUP_')) return 'invitation';
  if (action.startsWith('ADMIN_ORGANIZATION_')) return 'organization';
  return null;
}
