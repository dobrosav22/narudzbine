import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Organization } from '../api';
import {
  auditResourceKind,
  correctionUnchanged,
  countryToday,
  defaultSupportReportQuery,
  isEvidenceReference,
  isFilledWithin,
  normalizeResourceId,
  organizationCorrectionBody,
  organizationCorrectionForm,
  planOverages,
  sortPlans,
  supportTimeLeft,
} from './admin';

const org: Organization = {
  id: '01a17298-754f-7e54-acfa-50e29c8db76e',
  revision: 'rev-1',
  displayName: 'Lipa',
  legalName: 'Lipa d.o.o.',
  type: 'VENDOR',
  country: 'RS',
  currency: 'RSD',
  registrationIdentifier: '12345678',
  taxIdentifier: null,
  registeredAddress: { line1: 'Ulica 1', line2: null, city: 'Beograd', postalCode: '11000', country: 'RS', latitude: 44.8, longitude: 20.4 },
  defaultLanguage: 'sr-Latn-RS',
  state: 'ACTIVE',
  staffSubmissionRestricted: false,
  ownerAccountId: '01a17298-754f-7626-a263-54d8eb3106e3',
  createdAt: '2026-10-25T10:00:00.000Z',
  updatedAt: '2026-10-25T10:00:00.000Z',
  partnerContactId: null,
};

test('normalizeResourceId accepts canonical UUIDv7 only', () => {
  assert.equal(normalizeResourceId('  01A17298-754F-7E54-ACFA-50E29C8DB76E '), '01a17298-754f-7e54-acfa-50e29c8db76e');
  assert.equal(normalizeResourceId('01a17298-754f-4e54-acfa-50e29c8db76e'), null); // v4
  assert.equal(normalizeResourceId('not-an-id'), null);
});

test('evidence reference grammar and bounded text', () => {
  assert.ok(isEvidenceReference('CASE-2026/17:a.b'));
  assert.ok(!isEvidenceReference('-leading'));
  assert.ok(!isEvidenceReference('has space'));
  assert.ok(!isEvidenceReference('x'.repeat(201)));
  assert.ok(isFilledWithin(' a ', 1));
  assert.ok(!isFilledWithin('   ', 10));
  assert.ok(!isFilledWithin('ab', 1));
  // Code points, not UTF-16 units.
  assert.ok(isFilledWithin('😀', 1));
});

test('planOverages reports each exceeded limit', () => {
  const plan = { productLimit: 10, activeBuyerLimit: 5 };
  assert.deepEqual(planOverages(plan, { nonArchivedProductCount: 10, activeBuyerCount: 5 }), []);
  assert.deepEqual(planOverages(plan, { nonArchivedProductCount: 11, activeBuyerCount: 6 }), ['products', 'buyers']);
});

test('sortPlans orders by size with retired last', () => {
  const p = (code: 'STARTER' | 'GROWTH' | 'PRO', productLimit: number, retired = false) => ({ id: code, code, revision: 1, retired, productLimit, activeBuyerLimit: 1 });
  assert.deepEqual(
    sortPlans([p('PRO', 5000), p('STARTER', 10, true), p('GROWTH', 250), p('STARTER', 10)]).map((x) => `${x.code}${x.retired ? '*' : ''}`),
    ['STARTER', 'GROWTH', 'PRO', 'STARTER*'],
  );
});

test('countryToday uses the target country zone', () => {
  // 23:30 UTC on 31 Dec is already 1 Jan in Belgrade/Sarajevo (UTC+1).
  const now = new Date('2026-12-31T23:30:00.000Z');
  assert.equal(countryToday('RS', now), '2027-01-01');
  assert.equal(countryToday('BA', now), '2027-01-01');
  assert.deepEqual(defaultSupportReportQuery('RS', now), { from: '2026-12-03', to: '2027-01-01', grouping: 'DAY' });
});

test('supportTimeLeft never goes negative', () => {
  assert.equal(supportTimeLeft('2026-10-25T10:30:00.000Z', Date.parse('2026-10-25T10:00:00.000Z')), 30 * 60_000);
  assert.equal(supportTimeLeft('2026-10-25T10:30:00.000Z', Date.parse('2026-10-25T11:00:00.000Z')), 0);
});

test('correction body is a complete replacement with explicit nulls and fixed country', () => {
  const form = { ...organizationCorrectionForm(org), displayName: ' Lipa 2 ', taxIdentifier: '  ', line2: ' Sprat 2 ', reason: ' typo ' };
  assert.deepEqual(organizationCorrectionBody(org, form, 'rev-1'), {
    expectedRevision: 'rev-1',
    displayName: 'Lipa 2',
    legalName: 'Lipa d.o.o.',
    registrationIdentifier: '12345678',
    taxIdentifier: null,
    registeredAddress: { line1: 'Ulica 1', line2: 'Sprat 2', city: 'Beograd', postalCode: '11000', country: 'RS', latitude: 44.8, longitude: 20.4 },
    reason: 'typo',
  });
  assert.ok(correctionUnchanged(org, { ...organizationCorrectionForm(org), reason: 'x' }));
  assert.ok(!correctionUnchanged(org, form));
});

test('auditResourceKind maps action families to console screens', () => {
  assert.equal(auditResourceKind('RECOVERY_CREATED'), 'recoveryCase');
  assert.equal(auditResourceKind('PRIVACY_CASE_REQUESTED'), 'privacyCase');
  assert.equal(auditResourceKind('SETUP_INVITED'), 'invitation');
  assert.equal(auditResourceKind('ADMIN_ORGANIZATION_SUSPENDED'), 'organization');
  assert.equal(auditResourceKind('SESSION_CREATED'), null);
});
