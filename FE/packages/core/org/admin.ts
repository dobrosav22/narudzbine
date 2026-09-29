import { NOTIFICATION_TYPES_BY_SIDE } from '../constants';
import { countMsg, formatNumber } from '../helpers';
import { msg, type Msg } from '../i18n/message';
import type { AppServices } from '../services';
import type {
  BuyerUser,
  Invite,
  LocationInput,
  Membership,
  NotificationChannel,
  NotificationPreference,
  NotificationType,
  SubscriptionTier,
  VendorUsage,
  VendorUser,
} from '../types';

// ── Locations ────────────────────────────────────────────────────────────

export interface LocationDraft {
  name: string;
  address: string;
}

export const emptyLocationDraft = (): LocationDraft => ({ name: '', address: '' });

/** Same rules as the service (both required), checked before saving so the messages sit on the fields. */
export function validateLocationDraft(draft: LocationDraft): { input?: LocationInput; errors: Partial<Record<keyof LocationDraft, Msg>> } {
  const errors: Partial<Record<keyof LocationDraft, Msg>> = {};
  if (!draft.name.trim()) errors.name = msg('errors.locationNameRequired');
  if (!draft.address.trim()) errors.address = msg('errors.addressRequired');
  return Object.keys(errors).length ? { errors } : { errors, input: { name: draft.name.trim(), address: draft.address.trim() } };
}

/** What each side calls its locations (01 §7): warehouses for vendors, delivery addresses for buyers. */
/** What each side calls its locations (01 §7): warehouses for vendors, delivery addresses for buyers. Translation keys. */
export const LOCATION_COPY = {
  vendor: { title: 'locationsCopy.vendor.title', add: 'locationsCopy.vendor.add', count: 'locationsCopy.vendor.count', none: 'locationsCopy.vendor.none', one: 'locationsCopy.vendor.one' },
  buyer: { title: 'locationsCopy.buyer.title', add: 'locationsCopy.buyer.add', count: 'locationsCopy.buyer.count', none: 'locationsCopy.buyer.none', one: 'locationsCopy.buyer.one' },
} as const;

// ── Team ─────────────────────────────────────────────────────────────────

export interface TeamMember {
  user: VendorUser | BuyerUser;
  isYou: boolean;
  homeLocationName?: string;
}

export interface TeamView {
  members: TeamMember[];
  /** Pending team invites only (buyer-org invites live on the Buyers screen). */
  pending: Invite[];
  locations: { id: string; name: string }[];
}

type TeamDeps = Pick<AppServices, 'team' | 'invites' | 'locations'>;

/** Members (you first, then by name), pending team invites and the org's locations for home-location labels. */
export async function loadTeam(deps: TeamDeps, membership: Membership): Promise<TeamView> {
  const orgId = membership.org.id;
  const [users, invites, locations] = await Promise.all(
    membership.orgType === 'vendor'
      ? [deps.team.listVendorUsers(orgId), deps.invites.listSent({ targetOrgId: orgId }), deps.locations.listVendorLocations(orgId)]
      : [deps.team.listBuyerUsers(orgId), deps.invites.listSent({ targetOrgId: orgId }), deps.locations.listBuyerLocations(orgId)],
  );
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const members = users
    .map((user) => ({
      user,
      isYou: user.id === membership.user.id,
      homeLocationName: user.homeLocationId ? locationName.get(user.homeLocationId) : undefined,
    }))
    .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.user.name.localeCompare(b.user.name));
  return {
    members,
    pending: invites.filter((i) => i.type === 'team_member_invite'),
    locations: locations.map((l) => ({ id: l.id, name: l.name })),
  };
}

/**
 * Anyone may remove anyone (roles are flat — 01 §1) except themselves: removing your own
 * login from the screen you're using is almost always a mistake. The service keeps the
 * last-user rule.
 */
export function removeMemberBlocker(member: TeamMember, memberCount: number): Msg | undefined {
  if (member.isYou) return msg('errors.cantRemoveYourself');
  if (memberCount <= 1) return msg('errors.lastUser');
  return undefined;
}

export function removeTeamMember(deps: Pick<AppServices, 'team'>, membership: Membership, userId: string): Promise<void> {
  return membership.orgType === 'vendor' ? deps.team.removeVendorUser(userId) : deps.team.removeBuyerUser(userId);
}

// ── Account ──────────────────────────────────────────────────────────────

/** Matches the register and accept-invite rules in the mock service. */
export const MIN_PASSWORD_LENGTH = 4;

export interface PasswordDraft {
  current: string;
  next: string;
  confirm: string;
}

export function passwordProblems(d: PasswordDraft): Partial<Record<keyof PasswordDraft, Msg>> {
  const errors: Partial<Record<keyof PasswordDraft, Msg>> = {};
  if (!d.current) errors.current = msg('validation.password.currentRequired');
  if (d.next.length < MIN_PASSWORD_LENGTH) errors.next = msg('validation.password.tooShort', { min: MIN_PASSWORD_LENGTH });
  else if (d.next === d.current) errors.next = msg('validation.password.sameAsCurrent');
  if (d.confirm !== d.next) errors.confirm = msg('validation.password.mismatch');
  return errors;
}

// ── Notifications ────────────────────────────────────────────────────────

export const NOTIFICATION_CHANNELS: { value: NotificationChannel; labelKey: string }[] = [
  { value: 'push', labelKey: 'channels.push' },
  { value: 'email', labelKey: 'channels.email' },
];

export interface NotificationRow {
  type: NotificationType;
  labelKey: string;
  descriptionKey: string;
  enabled: Record<NotificationChannel, boolean>;
  /** Set when the type can't fire for this org; the toggles are then disabled with this reason (a key). */
  unavailableKey?: string;
}

/** The type × channel matrix (01 §8) for one side, in a stable order, from the service's full preference list. */
export function notificationRows(
  prefs: NotificationPreference[],
  side: 'vendor' | 'buyer',
  opts: { tracksInventory?: boolean } = {},
): NotificationRow[] {
  const on = (type: NotificationType, channel: NotificationChannel) =>
    prefs.find((p) => p.notificationType === type && p.channel === channel)?.enabled ?? true;
  return NOTIFICATION_TYPES_BY_SIDE[side].map((type) => ({
    type,
    labelKey: `notificationTypes.${type}.label`,
    descriptionKey: `notificationTypes.${type}.description`,
    enabled: { push: on(type, 'push'), email: on(type, 'email') },
    // 01 §8: low-stock alerts are only relevant when inventory tracking is on.
    unavailableKey: type === 'low_stock' && !opts.tracksInventory ? 'notificationTypes.lowStockUnavailable' : undefined,
  }));
}

// ── Plan ─────────────────────────────────────────────────────────────────

/**
 * Where a vendor's current usage exceeds `tier`'s limits. v1.1: nothing blocks the change
 * (only the admin changes tiers, and may deliberately go lower); screens show these as
 * warnings — the vendor would be hard-blocked from adding more until under the limits.
 */
export function planChangeProblems(usage: Pick<VendorUsage, 'productCount' | 'buyerCount'>, tier: SubscriptionTier): Msg[] {
  const problems: Msg[] = [];
  if (usage.productCount > tier.maxProducts)
    problems.push(countMsg('plan.tooSmallProducts', usage.productCount, { plan: tier.name, maxText: formatNumber(tier.maxProducts) }));
  if (usage.buyerCount > tier.maxBuyers)
    problems.push(countMsg('plan.tooSmallBuyers', usage.buyerCount, { plan: tier.name, maxText: formatNumber(tier.maxBuyers) }));
  return problems;
}

/** 0–1 share of a limit, for usage meters. */
export function usageShare(used: number, max: number): number {
  return max > 0 ? Math.min(1, used / max) : 1;
}
