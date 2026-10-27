/**
 * Client-generated identifiers. The backend contract uses:
 *  - UUIDv7 for client-chosen resource IDs on create (`id` in POST bodies), retried with the same
 *    body so a lost response replays the original success;
 *  - UUIDv4 for `Idempotency-Key` on direct orders, stock deltas, messages and invitation resends.
 * Requires `crypto.getRandomValues` (browsers, Node 19+, React Native via a polyfill).
 */

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const source = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (!source?.getRandomValues) throw new Error('crypto.getRandomValues is unavailable; install a secure random polyfill.');
  source.getRandomValues(bytes);
  return bytes;
}

function format(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let lastMillis = 0;
let sequence = 0;

/** Time-ordered UUIDv7 (RFC 9562) with a 12-bit monotonic counter for same-millisecond calls. */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  if (now <= lastMillis) {
    sequence = (sequence + 1) & 0xfff;
    if (sequence === 0) lastMillis += 1;
    now = lastMillis;
  } else {
    lastMillis = now;
    sequence = (bytes[6]! << 8 | bytes[7]!) & 0x7ff;
  }
  const millis = BigInt(now);
  for (let i = 0; i < 6; i++) bytes[i] = Number((millis >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
  bytes[7] = sequence & 0xff;
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  return format(bytes);
}

/** Random UUIDv4, for Idempotency-Key headers. */
export function uuidv4(): string {
  const bytes = randomBytes(16);
  bytes[6] = 0x40 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  return format(bytes);
}
