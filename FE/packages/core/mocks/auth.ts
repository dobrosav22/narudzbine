import type { AuthService } from '../services';
import type { BuyerUser, Membership, Session, VendorUser } from '../types';
import { DEFAULT_ORDER_STATUSES } from '../constants';
import { serviceError } from '../errors';
import { MESSAGES } from '../i18n';
import { db } from './db';
import { clone, delay, findOrThrow, newId, nowIso } from './util';
import { tierById } from './orgs';

const TOKEN_PREFIX = 'mock-session:';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function membershipsFor(email: string): Membership[] {
  const vendor: Membership[] = db.vendorUsers
    .filter((u) => u.email === email)
    .map((user) => ({ orgType: 'vendor', user, org: db.vendorOrgs.find((o) => o.id === user.vendorOrgId)! }));
  const buyer: Membership[] = db.buyerUsers
    .filter((u) => u.email === email)
    .map((user) => ({ orgType: 'buyer', user, org: db.buyerOrgs.find((o) => o.id === user.buyerOrgId)! }));
  return [...vendor, ...buyer];
}

/** Token is just the email while mocked, so a reload can restore any seeded user. */
function sessionFor(email: string): Session {
  const admin = db.platformAdmins.find((a) => a.email === email);
  return clone({ token: TOKEN_PREFIX + email, email, memberships: membershipsFor(email), ...(admin ? { admin } : {}) });
}

/** A usable session: the Platform Admin (no org), or a login with at least one membership. */
const usable = (s: Session) => !!s.admin || s.memberships.length > 0;

function emailHasAccount(email: string): boolean {
  return email in db.passwords;
}

function checkPassword(email: string, password: string): void {
  if (db.passwords[email] !== password) throw serviceError('UNAUTHORIZED', 'errors.badCredentials');
}

export const authService: AuthService = {
  async login({ email, password }) {
    await delay();
    const e = normalizeEmail(email);
    checkPassword(e, password);
    const session = sessionFor(e);
    if (!usable(session)) throw serviceError('UNAUTHORIZED', 'errors.noOrganization');
    return session;
  },

  async restoreSession(token) {
    await delay(50);
    if (!token.startsWith(TOKEN_PREFIX)) return null;
    const email = token.slice(TOKEN_PREFIX.length);
    const session = sessionFor(email);
    return usable(session) ? session : null;
  },

  async logout() {
    await delay(50);
  },

  async registerVendor(input) {
    await delay();
    const email = normalizeEmail(input.email);
    if (emailHasAccount(email)) throw serviceError('CONFLICT', 'errors.emailTaken');
    if (!input.password || input.password.length < 4) throw serviceError('VALIDATION', 'errors.passwordTooShort', { min: 4 });
    // [assumed] The starting tier is still chosen at signup (03 v1.1 onboarding); only later changes go through requests.
    tierById(input.subscriptionTierId);
    const createdAt = nowIso();
    const org = { id: newId('vo'), name: input.orgName.trim(), subscriptionTierId: input.subscriptionTierId, tracksInventory: false, createdAt };
    db.vendorOrgs.push(org);
    const locale = input.preferredLocale ?? 'en';
    // [assumed] The starter statuses are named in the registrant's language; from then on they're the vendor's own text.
    const names = MESSAGES[locale].defaultStatuses as Record<string, string>;
    db.statusConfigs.push({ vendorOrgId: org.id, statuses: clone(DEFAULT_ORDER_STATUSES).map((st) => ({ ...st, label: names[st.key] ?? st.label })) });
    db.vendorUsers.push({ id: newId('vu'), vendorOrgId: org.id, email, name: input.name.trim(), preferredLocale: locale, createdAt });
    db.passwords[email] = input.password;
    return sessionFor(email);
  },

  async acceptInvite(token, input) {
    await delay();
    const invite = findOrThrow(db.invites, (i) => i.token === token, 'Invite');
    if (invite.status !== 'pending') throw serviceError('CONFLICT', 'errors.inviteAlreadyUsed', { status: invite.status });
    const email = normalizeEmail(invite.email);
    const existing = emailHasAccount(email);
    if (existing) checkPassword(email, input.password);
    else if (!input.name?.trim()) throw serviceError('VALIDATION', 'errors.nameRequired');
    else if (!input.password || input.password.length < 4) throw serviceError('VALIDATION', 'errors.passwordTooShort', { min: 4 });

    const createdAt = nowIso();
    // An existing person keeps their language; a new login starts in the one they signed up in.
    const locale = [...db.vendorUsers, ...db.buyerUsers].find((u) => u.email === email)?.preferredLocale ?? input.preferredLocale ?? 'en';
    const knownName =
      input.name?.trim() ||
      db.vendorUsers.find((u) => u.email === email)?.name ||
      db.buyerUsers.find((u) => u.email === email)?.name ||
      email;

    if (invite.type === 'buyer_org_invite') {
      const vendorOrgId = invite.vendorOrgId!;
      let buyerUser: BuyerUser | undefined = db.buyerUsers.find((u) => u.email === email);
      if (!buyerUser) {
        // New buyer: BuyerOrg + first BuyerUser + default Location (03 → "Invite acceptance").
        if (!input.orgName?.trim()) throw serviceError('VALIDATION', 'errors.companyNameRequired');
        const org = { id: newId('bo'), name: input.orgName.trim(), createdAt };
        const location = {
          id: newId('loc'),
          buyerOrgId: org.id,
          name: input.locationName?.trim() || org.name,
          address: input.locationAddress?.trim() ?? '',
        };
        buyerUser = { id: newId('bu'), buyerOrgId: org.id, email, name: knownName, homeLocationId: location.id, preferredLocale: locale, createdAt };
        db.buyerOrgs.push(org);
        db.locations.push(location);
        db.buyerUsers.push(buyerUser);
      }
      const buyerOrgId = buyerUser.buyerOrgId;
      const rel = db.relations.find((r) => r.vendorOrgId === vendorOrgId && r.buyerOrgId === buyerOrgId);
      if (rel) Object.assign(rel, { status: 'active', joinedAt: createdAt });
      else db.relations.push({ id: newId('rel'), vendorOrgId, buyerOrgId, status: 'active', joinedAt: createdAt });
    } else {
      const orgId = invite.targetOrgId!;
      if (invite.targetOrgType === 'vendor') {
        if (db.vendorUsers.some((u) => u.vendorOrgId === orgId && u.email === email))
          throw serviceError('CONFLICT', 'errors.alreadyMember');
        const user: VendorUser = { id: newId('vu'), vendorOrgId: orgId, email, name: knownName, preferredLocale: locale, createdAt };
        db.vendorUsers.push(user);
      } else {
        if (db.buyerUsers.some((u) => u.buyerOrgId === orgId && u.email === email))
          throw serviceError('CONFLICT', 'errors.alreadyMember');
        db.buyerUsers.push({ id: newId('bu'), buyerOrgId: orgId, email, name: knownName, preferredLocale: locale, createdAt });
      }
    }

    if (!existing) db.passwords[email] = input.password;
    invite.status = 'accepted';
    invite.acceptedAt = createdAt;
    return sessionFor(email);
  },

  async updateProfile({ email, name }) {
    await delay();
    const e = normalizeEmail(email);
    if (!name.trim()) throw serviceError('VALIDATION', 'errors.nameRequired');
    const users = [...db.vendorUsers, ...db.buyerUsers, ...db.platformAdmins].filter((u) => u.email === e);
    if (users.length === 0) throw serviceError('NOT_FOUND', 'errors.notFound');
    for (const u of users) u.name = name.trim();
    return sessionFor(e);
  },

  async changePassword({ email, currentPassword, newPassword }) {
    await delay();
    const e = normalizeEmail(email);
    if (db.passwords[e] !== currentPassword) throw serviceError('UNAUTHORIZED', 'errors.wrongCurrentPassword');
    if (newPassword.length < 4) throw serviceError('VALIDATION', 'errors.passwordTooShort', { min: 4 });
    db.passwords[e] = newPassword;
  },
};
