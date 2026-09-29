import type { AppServices } from '../services';
import type { Membership, PlatformAdmin, Session, VendorOrg } from '../types';
import type { AppLocale } from '../i18n/locales';

/**
 * Session context shared by both apps (02 → "State/context you'll need"):
 * who is logged in, which of their memberships is active, and — for buyers —
 * which vendor is active. Framework-free: each app wraps it in a small React
 * hook (useSyncExternalStore) and supplies its own persistent storage.
 */

/** Minimal async storage — localStorage on web, SecureStore on native. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | {
      status: 'signedIn';
      session: Session;
      membership: Membership;
      /** Buyer memberships only: vendors this buyer org is actively connected to. */
      connectedVendors: VendorOrg[];
      /** Buyer memberships only; undefined when the buyer has no connected vendors yet. */
      activeVendor?: VendorOrg;
    }
  /**
   * v1.1: the Platform Admin. Belongs to no org, so it's a separate state rather than a
   * membership — nothing written for vendor/buyer screens can be handed an admin by mistake.
   */
  | { status: 'admin'; session: Session; admin: PlatformAdmin };

export type SignedInState = Extract<SessionState, { status: 'signedIn' }>;
export type AdminState = Extract<SessionState, { status: 'admin' }>;

export interface SessionStore {
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  /** Restore from storage. Call once at app start; safe to call again. */
  init(): Promise<void>;
  /** After login / register / invite acceptance. `preferOrgId` picks the membership to open. */
  signIn(session: Session, preferOrgId?: string): Promise<void>;
  signOut(): Promise<void>;
  /** Org switcher: only for users holding more than one membership. */
  selectMembership(orgId: string): Promise<void>;
  /** Vendor switcher (buyers): the single action that changes vendor context. */
  selectVendor(vendorOrgId: string): Promise<void>;
  /** Re-fetch memberships + vendor connections (e.g. after accepting an invite while signed in). */
  refresh(): Promise<void>;
}

const KEYS = {
  token: 'narudzbine.session.token',
  org: 'narudzbine.session.org',
  vendor: (buyerOrgId: string) => `narudzbine.session.vendor.${buyerOrgId}`,
};

export function membershipKey(m: Membership): string {
  return m.org.id;
}

export function createSessionStore(deps: {
  storage: KeyValueStorage;
  auth: AppServices['auth'];
  buyerOrgs: AppServices['buyerOrgs'];
}): SessionStore {
  const { storage, auth, buyerOrgs } = deps;
  let state: SessionState = { status: 'loading' };
  const listeners = new Set<() => void>();
  let initPromise: Promise<void> | undefined;

  const set = (next: SessionState) => {
    state = next;
    for (const l of listeners) l();
  };

  async function enter(session: Session, preferOrgId?: string | null): Promise<void> {
    // 02 v1.1 "Admin panel": check for a PlatformAdmin session first, then org memberships.
    if (session.admin) {
      await storage.setItem(KEYS.token, session.token);
      await storage.removeItem(KEYS.org);
      set({ status: 'admin', session, admin: session.admin });
      return;
    }
    const membership =
      session.memberships.find((m) => membershipKey(m) === preferOrgId) ?? session.memberships[0];
    if (!membership) {
      await clear();
      return;
    }
    await storage.setItem(KEYS.token, session.token);
    await storage.setItem(KEYS.org, membershipKey(membership));

    if (membership.orgType === 'vendor') {
      set({ status: 'signedIn', session, membership, connectedVendors: [] });
      return;
    }
    const connectedVendors = await buyerOrgs.listConnectedVendors(membership.org.id);
    const remembered = await storage.getItem(KEYS.vendor(membership.org.id));
    const activeVendor = connectedVendors.find((v) => v.id === remembered) ?? connectedVendors[0];
    if (activeVendor) await storage.setItem(KEYS.vendor(membership.org.id), activeVendor.id);
    set({ status: 'signedIn', session, membership, connectedVendors, activeVendor });
  }

  async function clear(): Promise<void> {
    await storage.removeItem(KEYS.token);
    await storage.removeItem(KEYS.org);
    set({ status: 'signedOut' });
  }

  function signedIn(): SignedInState {
    if (state.status !== 'signedIn') throw new Error('Not signed in');
    return state;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    init() {
      initPromise ??= (async () => {
        try {
          const token = await storage.getItem(KEYS.token);
          const session = token ? await auth.restoreSession(token) : null;
          if (!session) return clear();
          await enter(session, await storage.getItem(KEYS.org));
        } catch {
          // A broken stored token or unreachable backend must not trap the user on a spinner.
          await clear();
        }
      })();
      return initPromise;
    },
    signIn: (session, preferOrgId) => enter(session, preferOrgId),
    async signOut() {
      const current = state;
      if (current.status === 'signedIn' || current.status === 'admin') {
        try {
          await auth.logout(current.session.token);
        } catch {
          // Local sign-out still happens if the server call fails.
        }
      }
      await clear();
    },
    selectMembership: (orgId) => enter(signedIn().session, orgId),
    async selectVendor(vendorOrgId) {
      const current = signedIn();
      const vendor = current.connectedVendors.find((v) => v.id === vendorOrgId);
      if (!vendor || current.membership.orgType !== 'buyer') return;
      await storage.setItem(KEYS.vendor(current.membership.org.id), vendor.id);
      set({ ...current, activeVendor: vendor });
    },
    async refresh() {
      const current = state;
      if (current.status !== 'signedIn' && current.status !== 'admin') throw new Error('Not signed in');
      const session = await auth.restoreSession(current.session.token);
      if (!session) return clear();
      await enter(session, current.status === 'signedIn' ? membershipKey(current.membership) : null);
    },
  };
}

/** The signed-in person's UI language (admin or active membership); undefined when signed out or loading. */
export function sessionLocale(state: SessionState): AppLocale | undefined {
  if (state.status === 'admin') return state.admin.preferredLocale;
  if (state.status === 'signedIn') return state.membership.user.preferredLocale;
  return undefined;
}

/**
 * Change the UI language for this person (01 §12: per individual). One login can hold several
 * user records (e.g. a vendor and a buyer membership), so every one of them is updated — the
 * language then doesn't flip when switching org. The caller refreshes the session afterwards.
 */
export async function saveSessionLocale(deps: Pick<AppServices, 'preferences'>, state: SessionState, locale: AppLocale): Promise<void> {
  if (state.status === 'admin') return deps.preferences.updateLocale({ userId: state.admin.id, userType: 'admin', locale });
  if (state.status !== 'signedIn') return;
  await Promise.all(
    state.session.memberships.map((m) => deps.preferences.updateLocale({ userId: m.user.id, userType: m.orgType, locale })),
  );
}
