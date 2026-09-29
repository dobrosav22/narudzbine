// [assumed] The data contract (04) has no auth section. This is the minimum
// the frontend needs; the real backend decides transport/token format.
import type { BuyerOrg, BuyerUser, PlatformAdmin, VendorOrg, VendorUser } from './orgs';
import type { AppLocale } from '../i18n/locales';

export type Membership =
  | { orgType: 'vendor'; user: VendorUser; org: VendorOrg }
  | { orgType: 'buyer'; user: BuyerUser; org: BuyerOrg };

/**
 * One login (email) can hold several memberships — e.g. a VendorUser in one
 * org and a BuyerUser in another (03 → "Navigation shape"). The app picks
 * one as active; nothing here assumes there is only one.
 */
export interface Session {
  token: string;
  email: string;
  memberships: Membership[];
  /**
   * v1.1: set when this login is the Platform Admin (01 §10). An admin belongs to no org, so
   * `memberships` is empty; the session store checks this first and routes to the admin shell.
   */
  admin?: PlatformAdmin;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Self-serve signup creates a new VendorOrg (buyers arrive via invites). */
export interface RegisterVendorInput {
  /** [assumed] The UI language in use while signing up (01 §12 first-login guess); 'en' if omitted. */
  preferredLocale?: AppLocale;
  name: string;
  email: string;
  password: string;
  orgName: string;
  subscriptionTierId: string;
}

export interface UpdateProfileInput {
  email: string;
  name: string;
}

export interface ChangePasswordInput {
  email: string;
  currentPassword: string;
  newPassword: string;
}

export interface AcceptInviteInput {
  /** [assumed] UI language for a brand-new login; an existing person keeps theirs. */
  preferredLocale?: AppLocale;
  /** Required when the invite email has no existing account. */
  name?: string;
  password: string;
  /** buyer_org_invite for a new buyer only: the new BuyerOrg's name. */
  orgName?: string;
  /** buyer_org_invite for a new buyer only: the default delivery Location. */
  locationName?: string;
  locationAddress?: string;
}
