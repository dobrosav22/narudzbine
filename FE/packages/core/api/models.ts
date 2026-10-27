export type * from './models.gen';
export type { paths, operations, components } from './schema.gen';
import type { components, operations } from './schema.gen';

/** Query parameters of an operation, e.g. `QueryOf<'listProducts'>`. */
export type QueryOf<K extends keyof operations> = NonNullable<operations[K]['parameters']['query']>;

/** Any `{ items, ... }` list page from the contract. */
export type PageOf<T> = { items: T[] };

export type OrganizationType = components['schemas']['Organization']['type'];
