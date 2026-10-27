# Gaps — identity, organization, account, notifications, shell (agent A)

Scope: web shell/nav/layouts, public auth flows, own account, organization settings, team,
locations, contacts, audit, privacy cases, notification preferences/inbox/devices; mobile layouts,
account tab and the same screens. Contract authority: `openapi.yaml`.

## Crucial backend gaps (UI impact)

1. **Invitation purpose is not readable from the emailed link.** `/#/invitation?token=…` is the same
   for organization setup, buyer setup, member and trading invitations (`TechnicalEmailResolver`),
   and `GET /invitations/{id}` needs an authenticated id. The UI asks the invitee to choose
   (new company / join team / connect existing buyer). A wrong choice costs a round trip
   (`TOKEN_INVALID`/404). Needed: a public, capability-bound read (e.g. `POST /invitations/inspection {token}`
   → purpose, organization type/country, inviter organization name) or a purpose-specific link path.
2. **Organization setup country/type are unknown to the client.** `SetupRequest.registeredAddress.country`
   must equal the invited country, but nothing tells the client which; the form lets the person pick
   RS/BA and relies on the 422. Same fix as (1).
3. **Recovery acceptance link lacks the case id.** `/#/recovery-acceptance?token=…` but
   `POST /recovery-cases/{caseId}/acceptance` needs `caseId`; there is no business read of own recovery
   cases. Web `/recovery` asks for the case reference the operator gives out of band. Needed: case id in
   the link, or an acceptance endpoint keyed by token only.
4. **Ownership-transfer recipients are not notified and cannot list offers.** No notification event,
   no email and no list endpoint (`GET /organization/ownership-transfers/{id}` only). Owners/admins find
   the newest offer through `GET /organization/audit?action=TRANSFER_REQUESTED` (resourceId); STAFF
   recipients cannot read audit (403), so the owner must share the offer id ("reference") and the
   recipient looks it up. Needed: a transfer list or a recipient notification.
5. **No list of own email-change requests.** The pending change id is remembered client-side
   (localStorage / SecureStore per account); another browser/device cannot see or cancel it until it
   expires. Needed: `GET /auth/email-changes?state=PENDING` (own account).
6. **No list of privacy cases.** Read through `PRIVACY_CASE_REQUESTED` audit rows (20 newest) +
   `GET /organization/privacy-cases/{id}`. Needed: `GET /organization/privacy-cases`.
7. **Invitation metadata lacks the invited role.** `Invitation` has no `role`, so the team screen cannot
   show it or hide revoke/resend for ADMIN invitations that an admin may not manage; the backend 403s.
8. **No unread-notification count.** The badge uses the first `GET /me/notifications?unread=true&size=100`
   page ("99+" beyond), polled every 60 s. Needed: a count (or `total`) for the inbox.
9. **Push device registration has no client path yet.** Web has no FCM web SDK/service worker and mobile
   has no `expo-notifications`/FCM/APNs project (X/G-04). `registerDevice` is implemented in core
   (`registerDevice()` handles 201/202) but no UI registers a token; screens list and remove devices only.
   Note: the local runner accepted a fake token with 201 (verifier double), so production must not rely on
   token syntax.
10. **Notification `event` and inbox text**: `Notification.event` is a free string; inbox shows backend text
    only and links only `orderId` (no relationship/notification deep link field besides the push payload).

## Contract ambiguities resolved

- Handoff says `DELETE /organization/ownership-transfers/{id}` has no query; `openapi.yaml` requires
  `expectedRevision` — the client sends it (wire authority). Not exercised live (no second member in fixtures;
  brief forbids transfers).
- `PUT /organization` needs every member incl. `partnerContactId`; vendors always send
  `staffSubmissionRestricted=false` (`organizationUpdate()` in core).
- Emailed links are fragments. Web `/` parses `#/…` and forwards tokens in a fragment again
  (`/reset-password#token=…`, `/setup#proof=…`, `/accept-invitation#token=…`, `/email-change#token=…`,
  `/recovery#token=…|#case=…`); pages strip the fragment from the address bar. Signed-out `#/orders/{id}`
  etc. go through `/login?next=/#/…` (ids only, never tokens).
- Invitation token and mailbox proof arrive in two links: both are stored (web localStorage, mobile
  SecureStore) for at most 7 days and cleared on completion (`pendingInvitationStore`).
- Location contact: buyer locations require it (verified 422 `/contact`), vendor contact may be null.
- Partner contact archive clears `partnerContactId` (verified); the company form refetches.
- Settings sub-pages (`/vendor/settings/plan`, `/stages`) are wrapped by `app/vendor/settings/layout.tsx`
  (title + section links) — pages under it should not render their own page title (plan page currently does).

## Operations intentionally without UI (or limited)

- Mobile: organization setup (directs to web), closure, audit log, privacy cases, recovery acceptance and
  Google/Apple **linking** are web-only. Mobile external **login** shows only when
  `EXPO_PUBLIC_EXTERNAL_AUTH_RETURN_URL` (the server-configured app link, X-02) is set.
- Web external login/link buttons show both providers unless `NEXT_PUBLIC_EXTERNAL_LOGIN_PROVIDERS`
  narrows them ("" hides). REAUTHENTICATE via Google/Apple is not offered (the shared reauth dialog is
  password-only).
- `GET /locales` unused (UI uses the fixed `BACKEND_LOCALES`).
- `completeExternalCallback`/`completeExternalFormCallback` are provider→backend redirects, not client calls.

## Local-test limitations

- Email/push delivery off: setup, member, trading, reset, email-change proof and recovery links could only be
  exercised up to the request and with invalid tokens (all returned the documented 202/409 `TOKEN_INVALID`).
- Inbox was empty for seeded accounts (no notification worker output locally), so inbox rendering, mark-read
  and the badge are verified against empty lists only.
- Not exercised to protect shared fixtures: password change, completed email change, ownership transfer,
  member role change/deactivation of real members, organization closure, revoke-all sessions, unlink.
- No UI was run (`next dev`/`expo start` not allowed). Mobile typed routes were regenerated offline
  (`.expo/types/router.d.ts`) from the route tree.

## Core change requests

- `problems.codes` lacks identity codes used by these flows: `TOKEN_INVALID`, `EMAIL_UNAVAILABLE`,
  `RETAINED_METHOD_REQUIRED`, `NOTICE_PERIOD`, `DEVICE_CONFLICT`, `DEVICE_VERIFICATION_INVALID`,
  `IDENTITY_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`. Interim texts live in `auth.problems` (`useIdErrorText`).
- `i18n/messages.test.ts` "keys named in shared code and apps exist in English" fails on
  `found.length > 100` (fewer `msg()` literals after mock removal) — threshold needs updating; no missing keys.
- Shared app components left broken and unused by this area: web `components/language-select.tsx`
  (`changeLocale`), mobile `components/language-picker.tsx` (`changeLocale`), and both
  `components/query-states.tsx` (`isServiceError`). Replacements here: `features/auth/guest-language-select.tsx`
  (web), `features/auth/guest-language.tsx` (mobile).
