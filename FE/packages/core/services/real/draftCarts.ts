import type { DraftCartsService } from '../buyer';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const draftCartsService: DraftCartsService = {
  list: async () => notImplemented('draftCarts.list'),
  get: async () => notImplemented('draftCarts.get'),
  save: async () => notImplemented('draftCarts.save'),
  discard: async () => notImplemented('draftCarts.discard'),
};
