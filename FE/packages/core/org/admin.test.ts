import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnglish as en } from '../i18n/message';
import { createServices } from '../serviceProvider';
import { db, resetMockDb } from '../mocks/db';
import { setMockLatency } from '../mocks/util';
import { isServiceError } from '../errors';
import type { Membership } from '../types';
import {
  loadTeam,
  notificationRows,
  passwordProblems,
  planChangeProblems,
  removeMemberBlocker,
  removeTeamMember,
  usageShare,
  validateLocationDraft,
} from './admin';

setMockLatency(0);
const s = createServices(true);
beforeEach(() => resetMockDb());

const membershipOf = async (email: string, orgType: 'vendor' | 'buyer'): Promise<Membership> =>
  (await s.auth.login({ email, password: 'demo' })).memberships.find((m) => m.orgType === orgType)!;

const rejects = async (p: Promise<unknown>, code: Parameters<typeof isServiceError>[1]) => {
  await assert.rejects(p, (e) => isServiceError(e, code));
};

test('location draft: both fields required, trimmed on save', () => {
  assert.deepEqual(Object.keys(validateLocationDraft({ name: ' ', address: '' }).errors).sort(), ['address', 'name']);
  assert.deepEqual(validateLocationDraft({ name: ' Depot ', address: ' Street 1 ' }).input, { name: 'Depot', address: 'Street 1' });
});

test('location delete: refused while open orders use it; allowed once none do', async () => {
  const openAt = (locId: string) =>
    db.orders.filter((o) => o.locationId === locId && !db.statusConfigs.find((c) => c.vendorOrgId === o.vendorOrgId)!.statuses.find((x) => x.key === o.statusKey)!.isTerminal);
  const busy = db.locations.find((l) => openAt(l.id).length > 0 && db.locations.filter((x) => x.buyerOrgId === l.buyerOrgId).length > 1)!;
  await rejects(s.locations.deleteBuyerLocation(busy.id), 'CONFLICT');
  // Finish those orders and it goes through.
  for (const o of openAt(busy.id)) o.statusKey = db.statusConfigs.find((c) => c.vendorOrgId === o.vendorOrgId)!.statuses.find((x) => x.isTerminal && !x.isCancelled)!.key;
  await s.locations.deleteBuyerLocation(busy.id);
  assert.ok(!db.locations.some((l) => l.id === busy.id));
  // Last delivery location is never removable.
  await rejects(s.locations.deleteBuyerLocation('loc_sunce'), 'VALIDATION');
  // A new vendor warehouse with no orders deletes fine.
  const wh = await s.locations.createVendorLocation('vo_cleanpro', { name: 'Overflow', address: 'Somewhere 1' });
  await s.locations.deleteVendorLocation(wh.id);
});

test('team: you first, pending team invites only, home location names', async () => {
  const milica = await membershipOf('milica@aurora-hotels.rs', 'buyer');
  const team = await loadTeam(s, milica);
  assert.equal(team.members[0]!.user.email, 'milica@aurora-hotels.rs');
  assert.equal(team.members[0]!.isYou, true);
  assert.equal(team.members[0]!.homeLocationName, 'Aurora Central');
  assert.deepEqual(team.pending.map((i) => i.email), ['luka@aurora-hotels.rs']);
  assert.equal(team.locations.length, 3);
  assert.equal(en(removeMemberBlocker(team.members[0]!, team.members.length)!), "You can't remove yourself");
  assert.equal(removeMemberBlocker(team.members[1]!, team.members.length), undefined);
});

test('team: invite → pending → revoke; remove a member; last user stays', async () => {
  const marko = await membershipOf('marko@papirko.rs', 'vendor');
  const invite = await s.invites.createTeamInvite({ targetOrgId: 'vo_papirko', targetOrgType: 'vendor', email: 'novi@papirko.rs' });
  assert.equal((await loadTeam(s, marko)).pending.length, 1);
  await rejects(s.invites.createTeamInvite({ targetOrgId: 'vo_papirko', targetOrgType: 'vendor', email: 'ana@papirko.rs' }), 'CONFLICT');
  await s.invites.revoke(invite.id);
  assert.equal((await loadTeam(s, marko)).pending.length, 0);
  await rejects(s.auth.acceptInvite(invite.token, { name: 'Novi', password: 'pass1' }), 'CONFLICT');
  await rejects(s.invites.revoke(invite.id), 'CONFLICT');

  await removeTeamMember(s, marko, 'vu_ana');
  assert.deepEqual((await loadTeam(s, marko)).members.map((m) => m.user.id), ['vu_marko']);
  await rejects(removeTeamMember(s, marko, 'vu_marko'), 'VALIDATION');
});

test('revoking a buyer invite to an existing buyer frees the plan seat', async () => {
  const before = (await s.subscription.getUsage('vo_cleanpro')).buyerCount;
  await s.invites.revoke('inv_2'); // CleanPro → Café Lipa (existing org, relation "invited")
  assert.equal((await s.subscription.getUsage('vo_cleanpro')).buyerCount, before - 1);
});

test('profile: name changes on every membership of the login; password change checks the current one', async () => {
  const session = await s.auth.updateProfile({ email: 'ivan@cleanpro.rs', name: '  Ivan N. ' });
  assert.deepEqual(session.memberships.map((m) => m.user.name), ['Ivan N.', 'Ivan N.']);
  await rejects(s.auth.updateProfile({ email: 'ivan@cleanpro.rs', name: ' ' }), 'VALIDATION');

  await rejects(s.auth.changePassword({ email: 'ivan@cleanpro.rs', currentPassword: 'nope', newPassword: 'secret' }), 'UNAUTHORIZED');
  await rejects(s.auth.changePassword({ email: 'ivan@cleanpro.rs', currentPassword: 'demo', newPassword: 'x' }), 'VALIDATION');
  await s.auth.changePassword({ email: 'ivan@cleanpro.rs', currentPassword: 'demo', newPassword: 'secret' });
  await rejects(s.auth.login({ email: 'ivan@cleanpro.rs', password: 'demo' }), 'UNAUTHORIZED');
  assert.ok(await s.auth.login({ email: 'ivan@cleanpro.rs', password: 'secret' }));
});

test('password form: current required, new ≥ 4 and different, confirmation matches', () => {
  assert.deepEqual(Object.keys(passwordProblems({ current: '', next: 'ab', confirm: 'x' })).sort(), ['confirm', 'current', 'next']);
  assert.equal(en(passwordProblems({ current: 'demo', next: 'demo', confirm: 'demo' }).next!), 'Choose a password different from your current one');
  assert.deepEqual(passwordProblems({ current: 'demo', next: 'secret', confirm: 'secret' }), {});
});

test('notifications: side-specific rows; low stock unavailable without tracking; a toggle persists', async () => {
  const prefs = await s.notifications.getPreferences('vu_ivan', 'vendor');
  const rows = notificationRows(prefs, 'vendor', { tracksInventory: false });
  assert.deepEqual(rows.map((r) => r.type), ['order_placed', 'order_message_received', 'invite_received', 'low_stock']);
  assert.ok(rows.find((r) => r.type === 'low_stock')!.unavailableKey);
  assert.equal(notificationRows(prefs, 'vendor', { tracksInventory: true }).find((r) => r.type === 'low_stock')!.unavailableKey, undefined);

  await s.notifications.updatePreference({ userId: 'vu_ivan', userType: 'vendor', notificationType: 'order_placed', channel: 'email', enabled: false });
  const after = notificationRows(await s.notifications.getPreferences('vu_ivan', 'vendor'), 'vendor');
  assert.deepEqual(after[0]!.enabled, { push: true, email: false });
});

test('company: names required and trimmed; inventory tracking toggles product stock', async () => {
  await rejects(s.vendorOrgs.updateVendorOrg('vo_cleanpro', { name: '  ' }), 'VALIDATION');
  assert.equal((await s.buyerOrgs.updateBuyerOrg('bo_lipa', { name: ' Café Lipa Zemun ' })).name, 'Café Lipa Zemun');
  await s.vendorOrgs.updateVendorOrg('vo_cleanpro', { tracksInventory: true });
  assert.ok(db.products.filter((p) => p.vendorOrgId === 'vo_cleanpro').every((p) => p.stock === 0));
});

test('plan change: problems name what is over the limit; share is capped at 1', async () => {
  const usage = await s.subscription.getUsage('vo_papirko'); // 17 products, Growth
  const tiers = await s.subscription.listTiers();
  const problems = planChangeProblems(usage, tiers.find((t) => t.id === 'tier_starter')!);
  assert.equal(problems.length, 1);
  assert.match(en(problems[0]!), /^You have 17 products; Starter allows 10\.$/);
  assert.deepEqual(planChangeProblems(usage, tiers.find((t) => t.id === 'tier_pro')!), []);
  assert.equal(usageShare(12, 10), 1);
  assert.equal(usageShare(5, 10), 0.5);
});
