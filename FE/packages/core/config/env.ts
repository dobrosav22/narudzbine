/**
 * Env-driven runtime config for packages/core. Each app sets these through its own public-env
 * convention, and every name is written out literally because both bundlers inline env vars by
 * static text match — `process.env[name]` would never be replaced:
 *   - apps/web     NEXT_PUBLIC_*  (inlined by Next at build time)
 *   - apps/mobile  EXPO_PUBLIC_*  (inlined by babel-preset-expo)
 *   - node/tests   bare name
 */

/** Reads one inlined/env value; tolerates runtimes with no `process` global. */
function read(get: () => string | undefined): string | undefined {
  try {
    return get() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Backend base URL including `/api/v1`. Web defaults to the same-origin proxy (`/api/v1`, see
 * apps/web/next.config.ts), so browser cookies stay first-party. Native apps must set an
 * absolute https URL for real devices.
 */
export const API_BASE_URL: string =
  read(() => process.env.API_BASE_URL) ??
  read(() => process.env.NEXT_PUBLIC_API_BASE_URL) ??
  read(() => process.env.EXPO_PUBLIC_API_BASE_URL) ??
  '/api/v1';
