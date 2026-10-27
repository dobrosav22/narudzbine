import { api, data } from '../api/client';
import { resetPartnerCache } from './partners';
import type {
  Account,
  EmailChange,
  ExternalChallenge,
  ExternalStart,
  Organization,
  ProfileUpdate,
  Relationship,
  SessionResult,
  SetupRequest,
} from '../api/models';
import type { KeyValueStorage } from '../session/store';

/*
 * Own account, credentials and the public identity flows (password reset, invitations/setup,
 * email-change proofs, recovery acceptance, external login). React-free; apps wrap these with
 * React Query. Every write follows its contract retry rule: no Idempotency-Key here, natural
 * identity only, never an automatic retry after an uncertain outcome.
 */

// ── Passwords (DESIGN_SPEC: 15–128 Unicode code points, spaces kept, never normalized) ──

export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 128;

export type PasswordProblem = 'tooShort' | 'tooLong';

/** Client-side shape check only; the managed provider still rejects common/leaked passwords (PASSWORD_REJECTED). */
export function passwordProblem(password: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return 'tooShort';
  if (length > PASSWORD_MAX) return 'tooLong';
  return null;
}

// ── Keys and queries ──────────────────────────────────────────────────────

export const accountKeys = {
  all: ['account'] as const,
  sessions: () => ['account', 'sessions'] as const,
  externalIdentities: () => ['account', 'externalIdentities'] as const,
  emailChange: (changeId: string) => ['account', 'emailChange', changeId] as const,
};

export const accountQueries = {
  /** First 100 sessions (the backend caps active sessions well below this). */
  sessions: () => ({
    queryKey: accountKeys.sessions(),
    queryFn: () => data(api.GET('/auth/sessions', { params: { query: { size: 100 } } })),
  }),
  externalIdentities: () => ({
    queryKey: accountKeys.externalIdentities(),
    queryFn: () => data(api.GET('/auth/external-identities', { params: { query: { size: 100 } } })),
  }),
  emailChange: (changeId: string) => ({
    queryKey: accountKeys.emailChange(changeId),
    queryFn: () => data(api.GET('/auth/email-changes/{changeId}', { params: { path: { changeId } } })),
  }),
};

// ── Own account ───────────────────────────────────────────────────────────

/** PUT /me: displayName and the explicit nullable home location (null clears it). */
export function updateProfile(body: ProfileUpdate): Promise<Account> {
  return data(api.PUT('/me', { body }));
}

/** Guarded. Rotates this session's credential and revokes every other session. */
export function changePassword(newPassword: string): Promise<SessionResult> {
  return data(api.POST('/auth/password-changes', { body: { newPassword } }));
}

/** STAFF only; revokes every session (the caller is signed out afterwards). */
export async function deactivateSelf(expectedRevision: string): Promise<void> {
  await data(api.POST('/me/deactivation', { body: { expectedRevision } }));
}

export async function revokeSession(sessionId: string): Promise<void> {
  await data(api.DELETE('/auth/sessions/{sessionId}', { params: { path: { sessionId } } }));
}

/** Guarded. Signs out every session, including this one. */
export async function revokeAllSessions(): Promise<void> {
  await data(api.POST('/auth/sessions/revoke-all', {}));
}

/** Guarded (proof through a different retained method). Revokes every session on success. */
export async function unlinkExternalIdentity(identityId: string): Promise<void> {
  await data(api.DELETE('/auth/external-identities/{identityId}', { params: { path: { identityId } } }));
}

// ── Login-email change ────────────────────────────────────────────────────

/** Guarded. expectedRevision is the current Account revision (the request's natural identity). */
export function requestEmailChange(newEmail: string, expectedRevision: string): Promise<EmailChange> {
  return data(api.POST('/auth/email-changes', { body: { newEmail, expectedRevision } }));
}

export async function cancelEmailChange(changeId: string, expectedRevision: string): Promise<void> {
  await data(api.DELETE('/auth/email-changes/{changeId}', { params: { path: { changeId }, query: { expectedRevision } } }));
}

/** Guarded. Needs both mailbox proofs; success revokes every session (sign in with the new address). */
export function completeEmailChange(changeId: string, expectedRevision: string): Promise<EmailChange> {
  return data(api.POST('/auth/email-changes/{changeId}/completion', { params: { path: { changeId } }, body: { expectedRevision } }));
}

/** Public: one mailbox link (old or new address). Never changes the login email by itself. */
export async function verifyEmailChangeProof(token: string): Promise<void> {
  await data(api.POST('/auth/email-change-proofs', { body: { token } }));
}

/** Email-change requests have no list endpoint: remember the pending request id per account. */
export function emailChangeMemory(storage: KeyValueStorage) {
  const key = (accountId: string) => `narudzbine.emailChange.${accountId}`;
  return {
    get: (accountId: string) => storage.getItem(key(accountId)),
    set: (accountId: string, changeId: string) => storage.setItem(key(accountId), changeId),
    clear: (accountId: string) => storage.removeItem(key(accountId)),
  };
}

/** States after which the request can no longer progress. */
export function isEmailChangeFinished(change: EmailChange): boolean {
  return change.state === 'COMPLETED' || change.state === 'CANCELLED' || change.state === 'EXPIRED';
}

// ── Public password reset ─────────────────────────────────────────────────

/** Always a generic 202, whether or not the address exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  await data(api.POST('/auth/password-reset-requests', { body: { email } }));
}

/** Consumes the mailed proof; every session is revoked and the person signs in again. */
export async function completePasswordReset(token: string, newPassword: string): Promise<void> {
  await data(api.POST('/auth/password-resets', { body: { token, newPassword } }));
}

// ── Invitations and setup (public capabilities) ───────────────────────────

/**
 * What the invitee says the invitation is for. The emailed link carries only an opaque token
 * and the backend has no public read of its purpose (docs/frontend/area-notes/identity-organization.md), so the
 * person picks: set up a new organization, join an existing team, or connect an existing buyer
 * organization with a vendor.
 */
export type InvitationPurpose = 'ORGANIZATION' | 'MEMBER' | 'TRADING';

/** Generic 202 for valid and invalid tokens alike; a valid setup/member token mails a 30-minute proof link. */
export async function requestInvitationProof(token: string): Promise<void> {
  await data(api.POST('/invitations/email-proofs', { body: { token } }));
}

/** No session is issued: the new owner signs in explicitly afterwards. */
export function completeOrganizationSetup(body: SetupRequest): Promise<Organization> {
  return data(api.POST('/setup/organizations', { body }));
}

/** No session is issued: the new member signs in explicitly afterwards. */
export function completeMemberSetup(body: { token: string; emailProof: string; password: string; displayName: string }): Promise<Account> {
  return data(api.POST('/setup/members', { body }));
}

/** Signed-in intended buyer owner/admin only. */
export function acceptTradingInvitation(token: string): Promise<Relationship> {
  // The new or restored connection changes partner state, so drop cached partner reads.
  return data(api.POST('/invitations/trading/acceptance', { body: { token } })).finally(resetPartnerCache);
}

/** Signed-in intended account with a fresh password proof (guarded). */
export async function acceptRecovery(caseId: string, token: string): Promise<void> {
  await data(api.POST('/recovery-cases/{caseId}/acceptance', { params: { path: { caseId } }, body: { token } }));
}

export interface PendingInvitation {
  token?: string;
  proof?: string;
  purpose?: InvitationPurpose;
  savedAt: number;
}

/** The invitation capability lives seven days; proofs 30 minutes (each capped by the invitation). */
const PENDING_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The invitation token and the separately mailed proof arrive in two links (often opened in two
 * tabs), and setup needs both. They are kept only until setup completes or the invitation can no
 * longer be valid.
 */
export function pendingInvitationStore(storage: KeyValueStorage, now: () => number = Date.now) {
  const KEY = 'narudzbine.pendingInvitation';
  async function read(): Promise<PendingInvitation | null> {
    const raw = await storage.getItem(KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PendingInvitation;
      if (typeof parsed.savedAt !== 'number' || now() - parsed.savedAt > PENDING_INVITATION_TTL_MS) {
        await storage.removeItem(KEY);
        return null;
      }
      return parsed;
    } catch {
      await storage.removeItem(KEY);
      return null;
    }
  }
  return {
    read,
    async merge(patch: Partial<Omit<PendingInvitation, 'savedAt'>>): Promise<PendingInvitation> {
      const current = await read();
      // A different invitation token starts over: an old proof belongs to the old invitation.
      const fresh = !current || (patch.token !== undefined && current.token !== undefined && patch.token !== current.token);
      const next: PendingInvitation = fresh ? { ...patch, savedAt: now() } : { ...current, ...patch };
      await storage.setItem(KEY, JSON.stringify(next));
      return next;
    },
    clear: () => storage.removeItem(KEY),
  };
}

// ── External (Google / Apple) authentication ──────────────────────────────

export type ExternalProvider = ExternalStart['provider'];
export const EXTERNAL_PROVIDERS: readonly ExternalProvider[] = ['GOOGLE', 'APPLE'];

export function startExternalAuthentication(body: ExternalStart): Promise<ExternalChallenge> {
  return data(api.POST('/auth/external/challenges', { body }));
}

/** Native only: trades the one-use app-link code (60 s) and the PKCE verifier for a session. */
export function exchangeExternalLogin(code: string, codeVerifier: string): Promise<SessionResult> {
  return data(api.POST('/auth/external/exchanges', { body: { code, codeVerifier } }));
}

/** RFC 7636 verifier: 64 unreserved characters from a CSPRNG (43–128 allowed). */
export function createPkceVerifier(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const source = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (!source?.getRandomValues) throw new Error('crypto.getRandomValues is unavailable');
  const bytes = source.getRandomValues(new Uint8Array(64));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** base64url without padding, for the S256 code challenge of a SHA-256 digest. */
export function base64Url(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += chars[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += chars[n & 63]!;
  }
  return out;
}

// ── Emailed client links (FRONTEND_HANDOFF "Verified devices and external delivery") ──

/**
 * Backend emails and push payloads link to the client base plus a fragment, e.g.
 * `https://app/#/password-reset?token=…`. Fragments never reach a server log; screens keep the
 * token out of URLs they create and pass it only to its purpose endpoint.
 */
export type ClientLink =
  | { kind: 'invitation'; token: string }
  | { kind: 'invitationProof'; token: string }
  | { kind: 'passwordReset'; token: string }
  | { kind: 'emailProof'; token: string }
  | { kind: 'recoveryAcceptance'; token: string }
  | { kind: 'recovery'; caseId: string }
  | { kind: 'order'; orderId: string }
  | { kind: 'relationship'; relationshipId: string }
  | { kind: 'notification'; notificationId: string };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_LINKS: Record<string, 'invitation' | 'invitationProof' | 'passwordReset' | 'emailProof' | 'recoveryAcceptance'> = {
  invitation: 'invitation',
  'invitation-proof': 'invitationProof',
  'password-reset': 'passwordReset',
  'email-proof': 'emailProof',
  'recovery-acceptance': 'recoveryAcceptance',
};

/** Parses `#/route?token=…` (with or without the leading `#`). Unknown or malformed links give null. */
export function parseClientLink(hash: string): ClientLink | null {
  const value = hash.replace(/^#/, '');
  if (!value.startsWith('/')) return null;
  const [path = '', query = ''] = value.slice(1).split('?', 2);
  const segments = path.split('/').filter(Boolean);
  const tokenKind = segments.length === 1 ? TOKEN_LINKS[segments[0]!] : undefined;
  if (tokenKind) {
    const token = new URLSearchParams(query).get('token');
    return token ? { kind: tokenKind, token } : null;
  }
  if (segments.length !== 2 || !ID.test(segments[1]!)) return null;
  const id = segments[1]!.toLowerCase();
  switch (segments[0]) {
    case 'recovery':
      return { kind: 'recovery', caseId: id };
    case 'orders':
      return { kind: 'order', orderId: id };
    case 'relationships':
      return { kind: 'relationship', relationshipId: id };
    case 'notifications':
      return { kind: 'notification', notificationId: id };
    default:
      return null;
  }
}

/** Reads `#token=…&case=…` style fragment parameters on the public pages. */
export function fragmentParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.replace(/^#/, ''));
}

export function isUuid(value: string): boolean {
  return ID.test(value.trim());
}
