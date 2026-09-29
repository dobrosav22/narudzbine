import { countMsg, formatNumber } from '../helpers';
import { msg, type Msg } from '../i18n/message';
import type { AppServices } from '../services';
import type { SubscriptionTier, TierUpgradeRequest, VendorUsage } from '../types';

/** Usage plus the tier it's measured against — what every plan-aware screen shows. */
export type VendorPlan = VendorUsage & { tier: SubscriptionTier };

export type PlanLimit = 'products' | 'buyers';

/**
 * The one usage read (02 v1.1: getUsage is the single source of truth), joined with the
 * tier's name/price from listTiers. Used by Catalogue (Add Product), Buyers (Invite) and
 * Subscription & Billing — never re-derived elsewhere.
 */
export async function loadVendorPlan(deps: Pick<AppServices, 'subscription'>, vendorOrgId: string): Promise<VendorPlan> {
  const [usage, tiers] = await Promise.all([deps.subscription.getUsage(vendorOrgId), deps.subscription.listTiers()]);
  const tier = tiers.find((t) => t.id === usage.tierId);
  if (!tier) throw new Error(`Unknown subscription tier ${usage.tierId}`);
  return { ...usage, tier };
}

/** Hard block (01 §2): at OR over the limit disables the action outright. */
export function isAtLimit(usage: Pick<VendorUsage, 'productCount' | 'maxProducts' | 'buyerCount' | 'maxBuyers'> | undefined, limit: PlanLimit): boolean {
  if (!usage) return false;
  return limit === 'products' ? usage.productCount >= usage.maxProducts : usage.buyerCount >= usage.maxBuyers;
}

/** The inline message beside a disabled Add Product / Invite control. */
/** Parts, in order: the plan's allowance, "you have N" when over, and the way forward. */
export function limitMessage(plan: VendorPlan, limit: PlanLimit): Msg[] {
  const used = limit === 'products' ? plan.productCount : plan.buyerCount;
  const max = limit === 'products' ? plan.maxProducts : plan.maxBuyers;
  const p = limit === 'products' ? 'Products' : 'Buyers';
  return [
    countMsg(`plan.limit${p}`, max, { plan: plan.tier.name }),
    ...(used > max ? [countMsg(`plan.over${p}`, used)] : []),
    msg('plan.requestMore'),
  ];
}

/** "17 of 250 products on Growth" */
export function usageLine(plan: VendorPlan, limit: PlanLimit): Msg {
  return limit === 'products'
    ? msg('plan.usageProducts', { usedText: formatNumber(plan.productCount), count: plan.maxProducts, maxText: formatNumber(plan.maxProducts), plan: plan.tier.name })
    : msg('plan.usageBuyers', { usedText: formatNumber(plan.buyerCount), count: plan.maxBuyers, maxText: formatNumber(plan.maxBuyers), plan: plan.tier.name });
}

export const UPGRADE_REQUEST_STATUS_KEY: Record<TierUpgradeRequest['status'], string> = {
  pending: 'plan.requestStatus.pending',
  fulfilled: 'plan.requestStatus.fulfilled',
  dismissed: 'plan.requestStatus.dismissed',
};

/** A vendor may have one request in review at a time [assumed]; the service returns CONFLICT otherwise. */
export function pendingRequest(requests: TierUpgradeRequest[] | undefined): TierUpgradeRequest | undefined {
  return requests?.find((r) => r.status === 'pending');
}

/** Every tier except the current one, cheapest first (a vendor might ask to move down, too). */
export function requestableTiers(tiers: SubscriptionTier[], currentTierId: string): SubscriptionTier[] {
  return tiers.filter((t) => t.id !== currentTierId).sort((a, b) => a.priceMonthly - b.priceMonthly);
}
