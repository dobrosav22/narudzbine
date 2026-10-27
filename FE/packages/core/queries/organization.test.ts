import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Account, Organization } from '../api/models';
import {
  addressProblems,
  canManageInvitation,
  cleanAddress,
  contactFromDraft,
  contactProblems,
  emptyAddress,
  formatAddress,
  invitableRoles,
  memberActions,
  organizationUpdate,
  phoneProblem,
  textProblem,
} from './organization';

const account = (id: string, role: Account['role'], state: Account['state'] = 'ACTIVE'): Account => ({
  id,
  revision: 'r',
  organizationId: 'o',
  kind: 'BUSINESS',
  email: `${id}@example.com`,
  displayName: id,
  role,
  state,
  languageOverride: null,
  homeLocationId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

test('member actions follow the fixed role rules', () => {
  const owner = account('owner', 'OWNER');
  const admin = account('admin', 'ADMIN');
  const staff = account('staff', 'STAFF');
  assert.deepEqual(memberActions(owner, admin), { changeRole: true, deactivate: true, reactivate: false, transferOwnership: true });
  assert.deepEqual(memberActions(owner, owner), { changeRole: false, deactivate: false, reactivate: false, transferOwnership: false });
  assert.deepEqual(memberActions(admin, staff), { changeRole: false, deactivate: true, reactivate: false, transferOwnership: false });
  assert.equal(memberActions(admin, account('a2', 'ADMIN')).deactivate, false);
  assert.equal(memberActions(admin, owner).deactivate, false);
  assert.equal(memberActions(staff, account('s2', 'STAFF')).deactivate, false);
  assert.equal(memberActions(admin, account('gone', 'STAFF', 'DEACTIVATED')).reactivate, true);
  assert.equal(memberActions(admin, account('gone', 'ADMIN', 'DEACTIVATED')).reactivate, false);
  assert.equal(memberActions(owner, account('gone', 'ADMIN', 'DEACTIVATED')).reactivate, true);
  assert.equal(memberActions(owner, account('gone', 'STAFF', 'DEACTIVATED')).changeRole, false);
});

test('invitation authority', () => {
  assert.deepEqual(invitableRoles('OWNER'), ['ADMIN', 'STAFF']);
  assert.deepEqual(invitableRoles('ADMIN'), ['STAFF']);
  assert.deepEqual(invitableRoles('STAFF'), []);
  assert.equal(canManageInvitation('ADMIN', 'ADMIN'), false);
  assert.equal(canManageInvitation('ADMIN', 'STAFF'), true);
  assert.equal(canManageInvitation('OWNER', 'ADMIN'), true);
  assert.equal(canManageInvitation('STAFF', 'STAFF'), false);
});

test('organization update sends every member; vendors never restrict staff submission', () => {
  const org = {
    id: 'o',
    revision: 'rev',
    displayName: 'D',
    legalName: 'L',
    type: 'VENDOR',
    country: 'RS',
    currency: 'RSD',
    registrationIdentifier: 'x',
    taxIdentifier: null,
    registeredAddress: emptyAddress('RS'),
    defaultLanguage: 'en',
    state: 'ACTIVE',
    staffSubmissionRestricted: true,
    ownerAccountId: 'owner',
    createdAt: '',
    updatedAt: '',
    partnerContactId: null,
  } satisfies Organization;
  const body = organizationUpdate(org, { displayName: 'New' });
  assert.deepEqual(Object.keys(body).sort(), [
    'defaultLanguage',
    'displayName',
    'expectedRevision',
    'legalName',
    'partnerContactId',
    'registeredAddress',
    'staffSubmissionRestricted',
  ]);
  assert.equal(body.displayName, 'New');
  assert.equal(body.staffSubmissionRestricted, false);
  assert.equal(organizationUpdate({ ...org, type: 'BUYER' }).staffSubmissionRestricted, true);
});

test('draft validation mirrors contract bounds', () => {
  assert.equal(textProblem('  '), 'required');
  assert.equal(textProblem('', { required: false }), null);
  assert.equal(textProblem('x'.repeat(101)), 'tooLong');
  assert.equal(phoneProblem('+381 11 123', true), null);
  assert.equal(phoneProblem('(011) 123-45', true), null);
  assert.equal(phoneProblem('12', true), 'invalid');
  assert.equal(phoneProblem('abc', true), 'invalid');
  assert.equal(phoneProblem('', false), null);
  assert.deepEqual(contactProblems({ name: '', phone: 'x', email: 'bad' }), { name: 'required', phone: 'invalid', email: 'invalid' });
  assert.deepEqual(contactFromDraft({ name: ' A ', phone: ' 123 ', email: ' ' }), { name: 'A', phone: '123', email: null });
  assert.deepEqual(addressProblems(emptyAddress('BA')), { line1: 'required', city: 'required', postalCode: 'required' });
  const clean = cleanAddress({ ...emptyAddress('RS'), line1: ' Ulica 1 ', line2: '  ', city: 'Beograd ', postalCode: '11000' });
  assert.deepEqual(clean, { line1: 'Ulica 1', line2: null, city: 'Beograd', postalCode: '11000', country: 'RS', latitude: null, longitude: null });
  assert.equal(formatAddress(clean), 'Ulica 1, 11000 Beograd');
});
