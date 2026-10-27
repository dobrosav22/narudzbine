import { api, apiConfig, data, setCsrfToken } from '../api/client';
import { isApiError, isUnauthenticated, retryDelayMs } from '../api/problem';
import type { Account, Locale, Organization, SessionResult } from '../api/models';
import { resetPartnerCache } from '../queries/partners';

/**
 * Who is signed in, shared by both apps (each wraps it with useSyncExternalStore).
 *
 * A business account belongs to exactly one organization forever (no switcher), which is
 * either a BUYER or a VENDOR. Platform admins have no organization. A buyer's "active vendor"
 * is UI context only (which connected vendor's catalogue is open); it is remembered per buyer
 * organization and never sent as authorization.
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
  | { status: 'business'; account: Account; organization: Organization; activeVendorId: string | null }
  | { status: 'admin'; account: Account }
  /**
   * The stored session could not be checked (rate limit, outage, offline). The credential is
   * kept — only a 401 ends a session — and the app offers `retry()`.
   */
  | { status: 'unavailable'; error: unknown };

export type BusinessState = Extract<SessionState, { status: 'business' }>;
export type AdminState = Extract<SessionState, { status: 'admin' }>;

export interface SessionStore {
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  /** Restore from the browser cookie or stored bearer. Call once at app start; safe to repeat. */
  init(): Promise<void>;
  /** Try the session check again after `unavailable`. */
  retry(): Promise<void>;
  /** Password login. Rejects with ApiError (INVALID_LOGIN, RATE_LIMITED, ...). */
  login(input: { email: string; password: string }): Promise<SessionState>;
  /** Adopts a SessionResult from another flow (setup completion, external login, reauthentication). */
  adopt(result: SessionResult): Promise<SessionState>;
  /** Password reauthentication for guarded actions; rotates credentials and keeps the session. */
  reauthenticate(password: string): Promise<void>;
  logout(): Promise<void>;
  /** Local sign-out after a 401 (session revoked/expired elsewhere). No server call. */
  expire(): Promise<void>;
  /** Re-reads /me and /organization (after profile, language or organization edits). */
  refresh(): Promise<void>;
  /** Replace the cached account/organization from a mutation response without a refetch. */
  update(patch: { account?: Account; organization?: Organization }): void;
  selectVendor(vendorId: string | null): Promise<void>;
}

const RESTORE_ATTEMPTS = 3;

/** Failures worth waiting out: no response, rate limit, temporary unavailability. */
function isTransient(error: unknown): boolean {
  return isApiError(error) && (error.status === 0 || error.status === 429 || error.status === 503);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const KEYS = {
  bearer: 'narudzbine.session.bearer',
  vendor: (organizationId: string) => `narudzbine.activeVendor.${organizationId}`,
};

export function createSessionStore(deps: { storage: KeyValueStorage; deviceLabel: () => string }): SessionStore {
  const { storage } = deps;
  let state: SessionState = { status: 'loading' };
  const listeners = new Set<() => void>();
  let initPromise: Promise<void> | undefined;

  const set = (next: SessionState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const native = () => apiConfig().transport === 'NATIVE';

  async function load(): Promise<SessionState> {
    const account = await data(api.GET('/me'));
    if (account.kind === 'PLATFORM_ADMIN' || !account.organizationId) {
      const next: SessionState = { status: 'admin', account };
      set(next);
      return next;
    }
    const organization = await data(api.GET('/organization'));
    const activeVendorId = organization.type === 'BUYER' ? await storage.getItem(KEYS.vendor(organization.id)) : null;
    const next: SessionState = { status: 'business', account, organization, activeVendorId };
    set(next);
    return next;
  }

  /** Loads the session, waiting out transient failures (429/503/network) a few times. */
  async function restore(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        if (native() && !(await storage.getItem(KEYS.bearer))) return clearLocal();
        await load();
        return;
      } catch (error) {
        if (isUnauthenticated(error)) return clearLocal();
        if (!isTransient(error) || attempt >= RESTORE_ATTEMPTS) {
          if (!isApiError(error)) console.warn('[session] restore failed', error);
          set({ status: 'unavailable', error });
          return;
        }
        await wait(retryDelayMs(attempt, error));
      }
    }
  }

  async function clearLocal(): Promise<void> {
    setCsrfToken(null);
    resetPartnerCache();
    if (native()) await storage.removeItem(KEYS.bearer);
    set({ status: 'signedOut' });
  }

  async function storeCredentials(result: SessionResult): Promise<void> {
    resetPartnerCache();
    if (native()) {
      if (!result.bearerToken) throw new Error('Native session result without a bearer token.');
      await storage.setItem(KEYS.bearer, result.bearerToken);
    } else {
      setCsrfToken(result.csrfToken);
    }
  }

  const store: SessionStore = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    init() {
      initPromise ??= restore();
      return initPromise;
    },
    async retry() {
      set({ status: 'loading' });
      initPromise = restore();
      return initPromise;
    },
    async login({ email, password }) {
      const deviceLabel = deps.deviceLabel().slice(0, 100);
      let result: SessionResult;
      if (native()) {
        result = await data(api.POST('/auth/login', { body: { email, password, transport: 'NATIVE', deviceLabel } }));
      } else {
        // Single-use five-minute nonce bound to an HttpOnly pre-auth cookie; fetch a new one per attempt.
        const bootstrap = await data(api.GET('/auth/bootstrap'));
        result = await data(
          api.POST('/auth/login', {
            body: { email, password, transport: 'BROWSER', deviceLabel, preAuthNonce: bootstrap.nonce },
          }),
        );
      }
      return store.adopt(result);
    },
    async adopt(result) {
      await storeCredentials(result);
      return load();
    },
    async reauthenticate(password) {
      const result = await data(api.POST('/auth/reauthentication', { body: { password } }));
      await storeCredentials(result);
    },
    async logout() {
      try {
        await api.POST('/auth/logout', {});
      } catch {
        // Local sign-out still happens; the server session expires on its own.
      }
      await clearLocal();
    },
    expire: () => clearLocal(),
    async refresh() {
      try {
        await load();
      } catch (error) {
        if (isUnauthenticated(error)) await clearLocal();
        else throw error;
      }
    },
    update(patch) {
      if (state.status === 'business') {
        set({ ...state, account: patch.account ?? state.account, organization: patch.organization ?? state.organization });
      } else if (state.status === 'admin' && patch.account) {
        set({ ...state, account: patch.account });
      }
    },
    async selectVendor(vendorId) {
      if (state.status !== 'business' || state.organization.type !== 'BUYER') return;
      const key = KEYS.vendor(state.organization.id);
      if (vendorId) await storage.setItem(key, vendorId);
      else await storage.removeItem(key);
      set({ ...state, activeVendorId: vendorId });
    },
  };
  return store;
}

/** Reads the stored native bearer; pass to configureApi({ getBearer }). */
export function bearerReader(storage: KeyValueStorage): () => Promise<string | null> {
  return () => storage.getItem(KEYS.bearer);
}

/** The effective backend locale: the account override, else the organization default, else English. */
export function effectiveLocale(state: SessionState): Locale | undefined {
  if (state.status === 'business') return state.account.languageOverride ?? state.organization.defaultLanguage;
  if (state.status === 'admin') return state.account.languageOverride ?? 'en';
  return undefined;
}

export function isVendor(state: SessionState): state is BusinessState {
  return state.status === 'business' && state.organization.type === 'VENDOR';
}

export function isBuyer(state: SessionState): state is BusinessState {
  return state.status === 'business' && state.organization.type === 'BUYER';
}

/** OWNER and ADMIN manage the organization; STAFF have the fixed staff permissions. */
export function isOrgAdmin(state: SessionState): boolean {
  return state.status === 'business' && (state.account.role === 'OWNER' || state.account.role === 'ADMIN');
}
