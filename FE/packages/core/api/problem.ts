import type { components } from './schema.gen';

export type Problem = components['schemas']['Problem'];
export type FieldError = components['schemas']['FieldError'];

/**
 * Stable backend problem codes the UI branches on (RFC 9457 `code`). Not exhaustive: the backend
 * may add codes, and screens fall back to a generic message by HTTP status. Never parse `title`.
 */
export type KnownProblemCode =
  | 'MALFORMED_REQUEST'
  | 'MALFORMED_JSON'
  | 'VALIDATION_FAILED'
  | 'INVALID_VALUE'
  | 'INVALID_REFERENCE'
  | 'INVALID_STATE'
  | 'INVALID_LOGIN'
  | 'INVALID_SESSION'
  | 'AUTHORIZATION_EXPIRED'
  | 'AMBIGUOUS_AUTH_TRANSPORT'
  | 'CSRF_REJECTED'
  | 'REAUTHENTICATION_REQUIRED'
  | 'ACCESS_REVOKED'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'REVISION_MISMATCH'
  | 'IDEMPOTENCY_MISMATCH'
  | 'REQUEST_IN_PROGRESS'
  | 'REPLAY_EXPIRED'
  | 'RESOURCE_ID_REUSED'
  | 'DUPLICATE_NAME'
  | 'DUPLICATE_SKU'
  | 'SKU_RESERVED'
  | 'RESOURCE_REFERENCED'
  | 'UNIT_NAME_FROZEN'
  | 'UNIT_REQUIRED'
  | 'BASE_PRICE_REQUIRED'
  | 'PLAN_LIMIT_EXCEEDED'
  | 'PLAN_REQUIRED'
  | 'TERMS_CHANGED'
  | 'STOCK_SHORTAGE'
  | 'INSUFFICIENT_STOCK'
  | 'STOCK_CONFIRMATION_REQUIRED'
  | 'QUANTITY_INVALID'
  | 'PRODUCT_UNAVAILABLE'
  | 'RELATIONSHIP_UNAVAILABLE'
  | 'TRADING_DISCONNECTED'
  | 'ALREADY_CONNECTED'
  | 'PREVIEW_EXPIRED'
  | 'IMPORT_STALE'
  | 'PASSWORD_REJECTED'
  | 'ORGANIZATION_CLOSED'
  | 'ORGANIZATION_IDENTIFIER_IN_USE'
  | 'COUNTRY_IMMUTABLE'
  | 'NONTERMINAL_ORDERS'
  | 'DEVICE_LIMIT_REACHED'
  | 'DEVICE_CONFLICT'
  | 'UPLOAD_IN_PROGRESS'
  | 'UPLOAD_EXPIRED'
  | 'INVALID_IMAGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'EXPORT_LIMIT_REACHED'
  | 'EXPORT_EXPIRED'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  /** Client-side only: the request never reached the backend (offline, DNS, CORS, aborted). */
  | 'NETWORK_ERROR';

/**
 * Every failed API call rejects with this. `problem` is the backend's RFC 9457 body when there
 * was one; a response without a valid problem body still gets a synthetic one so screens only
 * ever handle one shape.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: Problem;
  /** Seconds from `Retry-After` on 429/503, when present. */
  readonly retryAfter: number | null;

  constructor(status: number, problem: Problem, retryAfter: number | null = null) {
    super(`${status} ${problem.code}: ${problem.title}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem.code;
    this.problem = problem;
    this.retryAfter = retryAfter;
  }

  /** Field errors from the problem body (422 validation). */
  get fieldErrors(): FieldError[] {
    return this.problem.errors ?? [];
  }

  /** The first field-error code for a body path such as `name` or `lines[0].quantity`. */
  fieldCode(path: string): string | undefined {
    return this.fieldErrors.find((e) => e.path === path || e.path === `/${path}` || e.path === `$.${path}`)?.code;
  }
}

export function isApiError(error: unknown, code?: KnownProblemCode | (string & {})): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** True when the outcome of a write is unknown (no response) — retry only with the same identity. */
export function isUncertainOutcome(error: unknown): boolean {
  return isApiError(error, 'NETWORK_ERROR') || (isApiError(error) && error.status >= 500 && error.code !== 'SERVICE_UNAVAILABLE');
}

/**
 * How long to wait before retrying a transient failure: the backend's Retry-After when given
 * (capped at 30 s), else a short linear backoff. Signature matches TanStack Query's `retryDelay`.
 */
export function retryDelayMs(attempt: number, error: unknown): number {
  const seconds = error instanceof ApiError && error.retryAfter !== null ? error.retryAfter : (attempt + 1) * 2;
  return Math.min(seconds, 30) * 1000;
}

/** 401 means the session (cookie or bearer) is no longer usable. */
export function isUnauthenticated(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}

function syntheticProblem(status: number, code: string, title: string): Problem {
  return { type: 'about:blank', title, status: Math.max(400, Math.min(599, status || 503)), code, requestId: '', errors: [] };
}

export function networkError(cause: unknown): ApiError {
  const error = new ApiError(0, syntheticProblem(503, 'NETWORK_ERROR', 'The service could not be reached.'));
  (error as { cause?: unknown }).cause = cause;
  return error;
}

/** Builds an ApiError from a non-2xx response, tolerating non-problem bodies. */
export async function problemFromResponse(response: Response): Promise<ApiError> {
  const retryHeader = response.headers.get('Retry-After');
  const retryAfter = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : null;
  let problem: Problem | undefined;
  try {
    const body = (await response.clone().json()) as Partial<Problem> | null;
    if (body && typeof body.code === 'string' && typeof body.status === 'number') {
      problem = { ...body, errors: body.errors ?? [] } as Problem;
    }
  } catch {
    // Not JSON (proxy error page, empty body).
  }
  problem ??= syntheticProblem(response.status, response.status === 401 ? 'INVALID_SESSION' : `HTTP_${response.status}`, response.statusText || 'Request failed');
  return new ApiError(response.status, problem, retryAfter);
}
