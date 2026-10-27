import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTIFICATION_EVENTS, togglePreference, unreadBadge } from './notifications';

test('toggling one switch sends the full six-event replacement', () => {
  const current = {
    id: 'a',
    revision: 'r',
    languageOverride: null,
    events: [{ event: 'MESSAGE_CREATED' as const, inApp: false, email: true, push: false }],
  };
  const body = togglePreference(current, 'ORDER_SUBMITTED', 'email', true);
  assert.deepEqual(
    body.map((p) => p.event),
    [...NOTIFICATION_EVENTS],
  );
  assert.deepEqual(body[0], { event: 'ORDER_SUBMITTED', inApp: true, email: true, push: false });
  assert.deepEqual(body[4], { event: 'MESSAGE_CREATED', inApp: false, email: true, push: false }, 'other saved choices are kept');
});

test('unread badge', () => {
  assert.equal(unreadBadge(0, false), null);
  assert.equal(unreadBadge(5, false), '5');
  assert.equal(unreadBadge(100, true), '99+');
  assert.equal(unreadBadge(100, false), '99+');
});
