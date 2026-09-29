/**
 * Env-driven runtime config for packages/core. Each app sets these through its
 * own public-env convention, and every name is written out literally because
 * both bundlers inline env vars by static text match — `process.env[name]`
 * would never be replaced:
 *   - apps/web     NEXT_PUBLIC_*  (inlined by Next at build time)
 *   - apps/mobile  EXPO_PUBLIC_*  (inlined by babel-preset-expo)
 *   - node/tests   bare name
 * See BUILD_LOG 2026-09-27 "USE_MOCKS wiring".
 */

/** Reads one inlined/env value; tolerates runtimes with no `process` global. */
function read(get: () => string | undefined): string | undefined {
  try {
    return get();
  } catch {
    return undefined;
  }
}

/** Mocks are ON unless explicitly turned off with the string "false". */
export const USE_MOCKS: boolean =
  (read(() => process.env.USE_MOCKS) ??
    read(() => process.env.NEXT_PUBLIC_USE_MOCKS) ??
    read(() => process.env.EXPO_PUBLIC_USE_MOCKS)) !== 'false';

/**
 * ISO 4217 code for every monetary value in the app (04 → "Currency": one
 * currency app-wide, no per-field code). Default BAM. A malformed value fails
 * at startup rather than rendering wrong prices.
 */
export const CURRENCY: string = parseCurrency(
  read(() => process.env.CURRENCY) ??
    read(() => process.env.NEXT_PUBLIC_CURRENCY) ??
    read(() => process.env.EXPO_PUBLIC_CURRENCY),
);

/**
 * BCP 47 locale for number/money/date display. Default bs-BA, so money reads
 * "19,60 KM" and thousands "5.000" (BUILD_LOG 2026-09-27 "Localized display").
 * UI copy stays English — this only drives Intl formatting.
 */
export const LOCALE: string = parseLocale(
  read(() => process.env.LOCALE) ??
    read(() => process.env.NEXT_PUBLIC_LOCALE) ??
    read(() => process.env.EXPO_PUBLIC_LOCALE),
);

function parseLocale(raw: string | undefined): string {
  const tag = raw?.trim() || 'bs-BA';
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? 'bs-BA';
  } catch {
    throw new Error(`[@repo/core] LOCALE must be a BCP 47 language tag (e.g. bs-BA), got "${raw}"`);
  }
}

function parseCurrency(raw: string | undefined): string {
  const code = raw?.trim().toUpperCase() || 'BAM';
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`[@repo/core] CURRENCY must be a 3-letter ISO 4217 code, got "${raw}"`);
  }
  return code;
}
