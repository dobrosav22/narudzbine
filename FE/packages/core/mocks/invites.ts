import { formatNumber } from '../helpers';
import type { InvitesService } from '../services';
import type { Invite } from '../types';
import { serviceError } from '../errors';
import { db } from './db';
import { tierById, usageFor } from './orgs';
import { clone, delay, findOrThrow, newId, nowIso } from './util';

function token(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function validEmail(email: string): string {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw serviceError('VALIDATION', 'errors.emailInvalid');
  return e;
}

export const invitesService: InvitesService = {
  async createBuyerOrgInvite({ vendorOrgId, email: rawEmail }) {
    await delay();
    const email = validEmail(rawEmail);
    // Hard limit (v1.1): the UI disables Invite first; this is the server-side backstop.
    const usage = usageFor(vendorOrgId);
    if (usage.buyerCount >= usage.maxBuyers) {
      throw serviceError('PLAN_LIMIT', 'errors.planLimitBuyers', { plan: tierById(usage.tierId).name, count: usage.maxBuyers, countText: formatNumber(usage.maxBuyers) }, {
        limit: 'buyers',
        max: usage.maxBuyers,
      });
    }
    if (db.invites.some((i) => i.vendorOrgId === vendorOrgId && i.email === email && i.status === 'pending'))
      throw serviceError('CONFLICT', 'errors.invitePending');

    const existingBuyer = db.buyerUsers.find((u) => u.email === email);
    if (existingBuyer) {
      const rel = db.relations.find((r) => r.vendorOrgId === vendorOrgId && r.buyerOrgId === existingBuyer.buyerOrgId);
      if (rel?.status === 'active') throw serviceError('CONFLICT', 'errors.buyerAlreadyConnected');
      if (rel) rel.status = 'invited';
      else db.relations.push({ id: newId('rel'), vendorOrgId, buyerOrgId: existingBuyer.buyerOrgId, status: 'invited' });
    }

    const invite: Invite = { id: newId('inv'), type: 'buyer_org_invite', email, token: token(), status: 'pending', vendorOrgId, sentAt: nowIso() };
    db.invites.push(invite);
    return clone(invite);
  },

  async createTeamInvite({ targetOrgId, targetOrgType, email: rawEmail }) {
    await delay();
    const email = validEmail(rawEmail);
    const members = targetOrgType === 'vendor'
      ? db.vendorUsers.filter((u) => u.vendorOrgId === targetOrgId)
      : db.buyerUsers.filter((u) => u.buyerOrgId === targetOrgId);
    if (members.some((u) => u.email === email)) throw serviceError('CONFLICT', 'errors.alreadyOnTeam');
    if (db.invites.some((i) => i.targetOrgId === targetOrgId && i.email === email && i.status === 'pending'))
      throw serviceError('CONFLICT', 'errors.invitePending');
    const invite: Invite = { id: newId('inv'), type: 'team_member_invite', email, token: token(), status: 'pending', targetOrgId, targetOrgType, sentAt: nowIso() };
    db.invites.push(invite);
    return clone(invite);
  },

  async listSent({ vendorOrgId, targetOrgId }) {
    await delay();
    return clone(
      db.invites
        .filter((i) => i.status === 'pending')
        .filter((i) => (vendorOrgId ? i.vendorOrgId === vendorOrgId : true) && (targetOrgId ? i.targetOrgId === targetOrgId : true))
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    );
  },

  async revoke(inviteId) {
    await delay();
    const invite = findOrThrow(db.invites, (i) => i.id === inviteId, 'Invite');
    if (invite.status !== 'pending') throw serviceError('CONFLICT', 'errors.inviteAlreadyUsed', { status: invite.status });
    invite.status = 'expired';
    // An existing buyer org invited by a vendor holds an 'invited' relation (and a plan seat) — release it.
    if (invite.type === 'buyer_org_invite') {
      const buyer = db.buyerUsers.find((u) => u.email === invite.email);
      const rel = buyer && db.relations.find((r) => r.vendorOrgId === invite.vendorOrgId && r.buyerOrgId === buyer.buyerOrgId);
      if (rel?.status === 'invited') rel.status = 'removed';
    }
  },

  async getByToken(t) {
    await delay();
    const invite = findOrThrow(db.invites, (i) => i.token === t, 'Invite');
    const orgName =
      invite.type === 'buyer_org_invite'
        ? db.vendorOrgs.find((o) => o.id === invite.vendorOrgId)?.name
        : invite.targetOrgType === 'vendor'
          ? db.vendorOrgs.find((o) => o.id === invite.targetOrgId)?.name
          : db.buyerOrgs.find((o) => o.id === invite.targetOrgId)?.name;
    return clone({ invite, orgName: orgName ?? 'Unknown organization', emailHasAccount: invite.email in db.passwords });
  },
};
