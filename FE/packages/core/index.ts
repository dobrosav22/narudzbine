// Shared, platform-agnostic frontend core: the typed backend client (api/), session store,
// formatting, translations and TanStack Query option factories (queries/). React-free; each app
// wraps these with its own React Query and React copies.
export * from './api';
export * from './config';
export * from './format';
export * from './money';
export * from './i18n';
export * from './session';
export * from './queries';
