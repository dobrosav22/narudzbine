import { ServiceError } from '../errors';
import { msg } from '../i18n/message';

let latency = { min: 150, max: 350 };

/** Tests set this to 0; screens get realistic jitter so loading states are real. */
export function setMockLatency(ms: number | { min: number; max: number }): void {
  latency = typeof ms === 'number' ? { min: ms, max: ms } : ms;
}

export function delay(ms?: number): Promise<void> {
  if (latency.max <= 0) return Promise.resolve();
  const wait = ms ?? latency.min + Math.random() * (latency.max - latency.min);
  return wait <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, wait));
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Mocks hand out copies so UI code can never mutate the "database" by accident. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function findOrThrow<T>(items: T[], pred: (t: T) => boolean, what: string): T {
  const found = items.find(pred);
  // English names the record for logs; screens show the generic translated message.
  if (!found) throw new ServiceError('NOT_FOUND', `${what} not found`, undefined, msg('errors.notFound'));
  return found;
}

/** Deterministic PRNG so the seed dataset is identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
