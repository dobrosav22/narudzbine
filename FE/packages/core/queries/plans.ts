import { api, data } from '../api/client';
import type { PlanRequest, PlanRevision, VendorPlan } from '../api/models';
import { countMsg, formatNumber } from '../format';
import { msg, type Msg } from '../i18n/message';

/*
 * Vendor plans (FRONTEND_HANDOFF "Vendor plans and plan-change requests"):
 *  - GET /organization/plan: current pinned plan revision + actual persisted usage
 *    (nonArchivedProductCount, activeBuyerCount). Every vendor role may read it.
 *  - GET /plans: immutable entitlement revisions (code, limits). No prices: the platform has
 *    no billing, so the UI never shows or infers a price.
 *  - Plan-change requests (owner/admin): POST {planRevisionId}; one PENDING at a time (a
 *    different pending target → 409 REQUEST_IN_PROGRESS); withdraw with DELETE ?expectedRevision.
 *    A platform admin approves/rejects; the rejection reason is vendor-visible.
 *  - Product and active-buyer caps apply to everyone; reaching one returns 409
 *    PLAN_LIMIT_EXCEEDED and changes nothing. Pending buyer invitations reserve no capacity:
 *    the cap is checked when the buyer accepts.
 */

export type PlanLimitKind = 'products' | 'buyers';
export type PlanCode = PlanRevision['code'];

export const planKeys = {
  all: ['plans'] as const,
  current: () => ['plans', 'current'] as const,
  available: (includeRetired: boolean) => ['plans', 'available', includeRetired] as const,
  requests: () => ['plans', 'requests'] as const,
};

export const planQueries = {
  /** Vendor organizations only (buyers get 404). */
  current: () => ({
    queryKey: planKeys.current(),
    queryFn: (): Promise<VendorPlan> => data(api.GET('/organization/plan')),
  }),
  /** With retired revisions when resolving historical requests/assignments by id. */
  available: (includeRetired = false) => ({
    queryKey: planKeys.available(includeRetired),
    queryFn: async (): Promise<PlanRevision[]> => {
      const page = await data(api.GET('/plans', { params: { query: { size: 100, ...(includeRetired ? { includeRetired: true } : {}) } } }));
      return orderPlansBySize(page.items);
    },
    staleTime: 10 * 60_000,
  }),
  /** Owner/admin only (staff get 403); newest first. */
  requests: () => ({
    queryKey: planKeys.requests(),
    queryFn: async (): Promise<PlanRequest[]> => (await data(api.GET('/organization/plan-requests', { params: { query: { size: 25 } } }))).items,
  }),
};

export function requestVendorPlanChange(planRevisionId: string): Promise<PlanRequest> {
  return data(api.POST('/organization/plan-requests', { body: { planRevisionId } }));
}

export async function withdrawVendorPlanRequest(input: { requestId: string; expectedRevision: string }): Promise<void> {
  await data(
    api.DELETE('/organization/plan-requests/{requestId}', {
      params: { path: { requestId: input.requestId }, query: { expectedRevision: input.expectedRevision } },
    }),
  );
}

/** Smallest plan first (by product, then buyer limit, then code/revision for a stable order). */
export function orderPlansBySize(plans: PlanRevision[]): PlanRevision[] {
  return [...plans].sort(
    (a, b) => a.productLimit - b.productLimit || a.activeBuyerLimit - b.activeBuyerLimit || a.code.localeCompare(b.code) || a.revision - b.revision,
  );
}

export function planUsage(plan: VendorPlan, kind: PlanLimitKind): { used: number; limit: number } {
  return kind === 'products'
    ? { used: plan.nonArchivedProductCount, limit: plan.plan.productLimit }
    : { used: plan.activeBuyerCount, limit: plan.plan.activeBuyerLimit };
}

/** At or over the cap: a new product / connection would be refused with PLAN_LIMIT_EXCEEDED. */
export function planAtLimit(plan: VendorPlan | null | undefined, kind: PlanLimitKind): boolean {
  if (!plan) return false;
  const { used, limit } = planUsage(plan, kind);
  return used >= limit;
}

/** i18n key of a plan code's display name ("Starter", "Growth", "Pro"). */
export function planCodeKey(code: PlanCode): string {
  return `plan.codes.${code}`;
}

/** The plan's name, with its revision when it is not the first one ("Growth · revision 2"). */
export function planNameMsg(plan: Pick<PlanRevision, 'code' | 'revision'>): Msg {
  return plan.revision > 1 ? msg('plan.nameRevision', { code: plan.code, revision: plan.revision }) : msg(planCodeKey(plan.code));
}

/** "17 of 250 products" / "3 of 50 active buyers". */
export function usageMsg(plan: VendorPlan, kind: PlanLimitKind): Msg {
  const { used, limit } = planUsage(plan, kind);
  return msg(kind === 'products' ? 'plan.usageProducts' : 'plan.usageBuyers', {
    usedText: formatNumber(used),
    count: limit,
    maxText: formatNumber(limit),
  });
}

/** The explanation beside a disabled or refused action at the cap. */
export function limitMsgs(plan: VendorPlan, kind: PlanLimitKind): Msg[] {
  const { used, limit } = planUsage(plan, kind);
  const p = kind === 'products' ? 'Products' : 'Buyers';
  return [countMsg(`plan.limit${p}`, limit), ...(used > limit ? [countMsg(`plan.over${p}`, used)] : []), msg('plan.requestMore')];
}

/**
 * Warnings for requesting a plan smaller than current usage: approval rechecks usage, so a
 * too-small target would be refused until products are archived or buyers disconnected.
 */
export function planChangeWarnings(plan: VendorPlan, target: PlanRevision): Msg[] {
  const out: Msg[] = [];
  if (plan.nonArchivedProductCount > target.productLimit)
    out.push(countMsg('plan.tooSmallProducts', plan.nonArchivedProductCount, { maxText: formatNumber(target.productLimit) }));
  if (plan.activeBuyerCount > target.activeBuyerLimit)
    out.push(countMsg('plan.tooSmallBuyers', plan.activeBuyerCount, { maxText: formatNumber(target.activeBuyerLimit) }));
  return out;
}

export function pendingPlanRequest(requests: PlanRequest[] | undefined): PlanRequest | undefined {
  return requests?.find((r) => r.state === 'PENDING');
}
