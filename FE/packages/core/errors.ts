import { msg, renderEnglish, type Msg } from './i18n/message';

export type ServiceErrorCode =
  | 'NOT_IMPLEMENTED'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'VALIDATION'
  | 'PLAN_LIMIT'
  | 'CONFLICT';

/**
 * The one error type every service (mock or real) throws. Screens branch on
 * `code` — e.g. PLAN_LIMIT renders the "you've hit your plan limit" prompt
 * from 01 §2 instead of a generic error.
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly details?: Record<string, unknown>;
  /**
   * The translatable form of `message` (02 "Internationalization": validation messages are
   * system text, so they're translated). Screens show `msg` in the viewer's language; `message`
   * stays English for logs. [assumed] A real backend should return a code/key like this too.
   */
  readonly msg?: Msg;

  constructor(code: ServiceErrorCode, message: string, details?: Record<string, unknown>, msg?: Msg) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.details = details;
    this.msg = msg;
  }
}

/** A ServiceError whose English message is rendered from the key — mocks throw these. */
export function serviceError(code: ServiceErrorCode, key: string, values?: Record<string, string | number>, details?: Record<string, unknown>): ServiceError {
  const m = msg(key, values);
  return new ServiceError(code, renderEnglish(m), details, m);
}

export function isServiceError(e: unknown, code?: ServiceErrorCode): e is ServiceError {
  return e instanceof ServiceError && (code === undefined || e.code === code);
}

/**
 * Used by every stub in services/real. Called from an async function, so it
 * surfaces as a rejected promise — exactly like a real network failure would —
 * and never falls back to mock data.
 */
export function notImplemented(operation: string): never {
  throw new ServiceError(
    'NOT_IMPLEMENTED',
    `Not implemented — see 04-data-contract-api-outline.md (${operation}). ` +
      `USE_MOCKS=false routes this call to the real service, which has not been written yet.`,
    { operation },
    msg('errors.notImplemented', { operation }),
  );
}
