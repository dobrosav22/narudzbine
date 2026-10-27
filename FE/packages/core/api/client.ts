import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './schema.gen';
import { ApiError, networkError, problemFromResponse } from './problem';

/**
 * Session transport (FRONTEND_HANDOFF "Locally verified authentication handoff"):
 *  - BROWSER: HttpOnly `__Host-` session cookie set by the backend; JavaScript never sees the
 *    session secret. Unsafe requests carry `X-CSRF-Token`, and the browser sends its Origin.
 *  - NATIVE: opaque bearer in OS secure storage, sent as `Authorization: Bearer`; no cookies,
 *    no Origin, no CSRF.
 * Never mix the two on one client.
 */
export type Transport = 'BROWSER' | 'NATIVE';

export interface ApiConfig {
  /** Absolute or same-origin base, e.g. `/api/v1` (web, proxied) or `https://api.example/api/v1`. */
  baseUrl: string;
  transport: Transport;
  /** NATIVE only: reads the stored bearer for each request. */
  getBearer?: () => Promise<string | null> | string | null;
  /** Called once per 401 response so the session store can sign out. */
  onUnauthenticated?: (error: ApiError) => void;
  /** Overrides global fetch (tests). */
  fetch?: typeof fetch;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let config: ApiConfig | null = null;
/** Browser CSRF proof: in memory only; re-fetched from GET /auth/csrf after a reload. */
let csrfToken: string | null = null;
let csrfInFlight: Promise<string | null> | null = null;

export function configureApi(next: ApiConfig): void {
  config = next;
  client = null;
  csrfToken = null;
}

export function apiConfig(): ApiConfig {
  if (!config) throw new Error('configureApi() must run before any API call.');
  return config;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

async function rawFetch(request: Request): Promise<Response> {
  const run = apiConfig().fetch ?? globalThis.fetch;
  try {
    return await run(request);
  } catch (cause) {
    throw networkError(cause);
  }
}

/** Fetches the stable CSRF proof for the current browser cookie; null when signed out. */
async function refreshCsrf(): Promise<string | null> {
  csrfInFlight ??= (async () => {
    const baseUrl = absoluteBase(apiConfig().baseUrl);
    const response = await rawFetch(new Request(`${baseUrl}/auth/csrf`, { method: 'GET', credentials: 'include' }));
    if (!response.ok) return null;
    const body = (await response.json()) as { csrfToken?: string };
    csrfToken = body.csrfToken ?? null;
    return csrfToken;
  })().finally(() => {
    csrfInFlight = null;
  });
  return csrfInFlight;
}

/** Login/bootstrap and public routes must not trigger a CSRF fetch (no session cookie yet). */
const CSRF_EXEMPT = /\/auth\/(bootstrap|login|password-reset-requests|password-resets|external\/)|\/setup\/|\/invitations\/(email-proofs|trading\/acceptance)|\/recovery-cases\/[^/]+\/acceptance|\/locales$/;

async function authorize(request: Request): Promise<Request> {
  const { transport, getBearer } = apiConfig();
  if (transport === 'NATIVE') {
    const bearer = await getBearer?.();
    const headers = new Headers(request.headers);
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
    return new Request(request, { headers, credentials: 'omit' });
  }
  const headers = new Headers(request.headers);
  if (UNSAFE.has(request.method) && !headers.has('X-CSRF-Token')) {
    const token = csrfToken ?? (CSRF_EXEMPT.test(new URL(request.url).pathname) ? null : await refreshCsrf());
    if (token) headers.set('X-CSRF-Token', token);
  }
  return new Request(request, { headers, credentials: 'include' });
}

/**
 * The fetch every generated call goes through: adds transport credentials, retries a request
 * once after CSRF_REJECTED (it was refused before any effect, so this is safe), and turns every
 * non-2xx response into an ApiError rejection.
 */
async function apiFetch(input: Request): Promise<Response> {
  const retryCopy = input.clone();
  let response = await rawFetch(await authorize(input));
  if (response.status === 403 && apiConfig().transport === 'BROWSER' && UNSAFE.has(input.method)) {
    const error = await problemFromResponse(response);
    if (error.code !== 'CSRF_REJECTED') throw error;
    const fresh = await refreshCsrf();
    if (!fresh) throw error;
    const headers = new Headers(retryCopy.headers);
    headers.set('X-CSRF-Token', fresh);
    response = await rawFetch(new Request(retryCopy, { headers, credentials: 'include' }));
  }
  if (!response.ok) {
    const error = await problemFromResponse(response);
    if (response.status === 401) apiConfig().onUnauthenticated?.(error);
    throw error;
  }
  return response;
}

let client: Client<paths> | null = null;

function absoluteBase(baseUrl: string): string {
  if (/^https?:\/\//.test(baseUrl)) return baseUrl.replace(/\/$/, '');
  // Same-origin base (web behind its /api proxy). Request() needs an absolute URL outside browsers.
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  if (!origin) throw new Error(`A relative API base URL (${baseUrl}) needs a browser location.`);
  return `${origin}${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`.replace(/\/$/, '');
}

function current(): Client<paths> {
  client ??= createClient<paths>({
    baseUrl: absoluteBase(apiConfig().baseUrl),
    fetch: (request) => apiFetch(request),
    querySerializer: { array: { style: 'form', explode: true } },
  });
  return client;
}

/**
 * The typed client. Paths, params, bodies and responses come from openapi.yaml via
 * schema.gen.ts (regenerate with `pnpm --filter @repo/core gen:api`). Use `data()` to unwrap.
 */
export const api: Client<paths> = new Proxy({} as Client<paths>, {
  get: (_target, key) => current()[key as keyof Client<paths>],
});

/**
 * Unwraps an openapi-fetch result. Errors never reach here (apiFetch rejects), so `data` is the
 * success body; 204 responses resolve to undefined.
 */
export async function data<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const result = await call;
  return result.data as T;
}

/** Absolute URL for an API path, e.g. image content for `<img src>` (web cookies authenticate it). */
export function apiUrl(path: string): string {
  return `${absoluteBase(apiConfig().baseUrl)}${path}`;
}

/** Processed image bytes for a READY media asset. */
export function assetContentUrl(assetId: string): string {
  return apiUrl(`/media/assets/${assetId}/content`);
}

/** For binary/text downloads where openapi-fetch's JSON parsing is not wanted. */
export async function download(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = absoluteBase(apiConfig().baseUrl);
  return apiFetch(new Request(`${baseUrl}${path}`, { method: 'GET', ...init }));
}

/** For uploads with non-JSON bodies (image bytes, CSV text). */
export async function send(path: string, init: RequestInit & { method: string }): Promise<Response> {
  const baseUrl = absoluteBase(apiConfig().baseUrl);
  return apiFetch(new Request(`${baseUrl}${path}`, init));
}

export { ApiError };
