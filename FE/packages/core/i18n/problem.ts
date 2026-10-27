import { ApiError, isApiError } from '../api/problem';
import { msg, type Msg } from './message';
import { en } from './resources.gen';

const KNOWN = new Set(Object.keys(en.problems.codes));

/**
 * The translatable message for any failure: the backend problem `code` when the UI has a text
 * for it (problems.codes.<CODE>), else one by HTTP status, else a generic one. Backend `title`
 * is English diagnostics only and is never shown (D-LOC-001: clients render stable codes).
 */
export function problemMsg(error: unknown): Msg {
  if (isApiError(error)) {
    if (KNOWN.has(error.code)) return msg(`problems.codes.${error.code}`);
    const status = statusBucket(error);
    return msg(`problems.status.${status}`);
  }
  return msg('problems.status.unknown');
}

function statusBucket(error: ApiError): string {
  if (error.status === 0) return 'network';
  if ([400, 401, 403, 404, 409, 413, 415, 422, 429].includes(error.status)) return String(error.status);
  return error.status >= 500 ? '503' : 'unknown';
}

/** Field-level message for a 422 field error code (problems.fields.<code>), else a generic one. */
export function fieldProblemMsg(code: string | undefined): Msg | undefined {
  if (!code) return undefined;
  return code in en.problems.fields ? msg(`problems.fields.${code}`) : msg('problems.fields.INVALID_VALUE');
}
