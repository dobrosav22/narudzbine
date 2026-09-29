// Plain config for the shared package (02 → monorepo tree: packages/core/config).
// env.ts: per-deployment values read from the environment (USE_MOCKS, CURRENCY, LOCALE).
// subscriptionTiers.ts: the editable tier list (v1.1, 01 §2) — deliberately not env vars.
export * from './env';
export * from './subscriptionTiers';
